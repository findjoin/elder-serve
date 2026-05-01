from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path
from urllib import request


ROOT = Path(__file__).resolve().parents[1]
DEMO_NOON_TIME = "12:10"


def read_local_properties() -> dict[str, str]:
    path = ROOT / "caregiver-android" / "local.properties"
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if "=" not in line or line.strip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def post_json(base_url: str, api_key: str, path: str, payload: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "x-api-key": api_key,
        },
    )
    with request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_many_json(base_url: str, api_key: str, path: str, items: list[dict], workers: int = 12) -> tuple[int, list[str]]:
    errors: list[str] = []
    if not items:
        return 0, errors

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [pool.submit(post_json, base_url, api_key, path, item) for item in items]
        ok = 0
        for future in as_completed(futures):
            try:
                future.result()
                ok += 1
            except Exception as error:  # noqa: BLE001 - script reports all upload failures together.
                errors.append(str(error))
    return ok, errors


def parse_start_minutes(window: str) -> int:
    raw = str(window or "").split("-", 1)[0].strip()
    if ":" not in raw:
        return 24 * 60
    hour, minute = raw.split(":", 1)
    return int(hour) * 60 + int(minute)


def format_date(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def template_items(template: dict) -> list[tuple[dict, dict]]:
    rows: list[tuple[dict, dict]] = []
    for section in template.get("sections", []):
        for item in section.get("items", []):
            rows.append((section, item))
    return rows


def build_demo_payload(institution_id: str, institution_name: str) -> tuple[dict, dict, list[dict], list[dict]]:
    current = datetime.now()
    today = format_date(current)
    now = f"{today} {DEMO_NOON_TIME}"
    template_id = "daily-report-qinghe-basic"
    template_title = "青禾标准护理日报"

    caregivers = [
        {"id": "caregiver-demo-01", "name": "张建国", "role": "金牌护工", "employeeNo": "QH202601", "floor": 1, "shift": "07:00 - 15:30", "status": "on-duty"},
        {"id": "caregiver-demo-02", "name": "陈秀英", "role": "护理组长", "employeeNo": "QH202602", "floor": 2, "shift": "07:00 - 15:30", "status": "on-duty"},
        {"id": "caregiver-demo-03", "name": "周桂芬", "role": "生活护工", "employeeNo": "QH202603", "floor": 3, "shift": "07:00 - 15:30", "status": "on-duty"},
        {"id": "caregiver-demo-04", "name": "赵志强", "role": "机动护工", "employeeNo": "QH202604", "floor": 4, "shift": "07:00 - 15:30", "status": "on-duty"},
        {"id": "caregiver-demo-05", "name": "刘彩云", "role": "晚班护工", "employeeNo": "QH202605", "floor": 5, "shift": "15:00 - 22:30", "status": "off-duty"},
    ]

    def elder(eid: str, room: str, floor: int, name: str, gender: str, age: int, level: str, tags: list[str], contact: str, phone: str, bp: str, hr: str) -> dict:
        return {
            "id": eid,
            "room": room,
            "bed": f"{room}-1床",
            "floor": floor,
            "name": name,
            "gender": gender,
            "age": age,
            "level": level,
            "tags": tags,
            "reportTemplateId": template_id,
            "reportTemplateTitle": template_title,
            "familyContact": contact,
            "familyPhone": phone,
            "latestBloodPressure": bp,
            "latestHeartRate": hr,
        }

    elders = [
        elder("elder-demo-101", "101", 1, "王大爷", "男", 82, "二级护理", ["高血压", "晨间协助"], "长子：王建设", "138****8888", "135/85", "72"),
        elder("elder-demo-102", "102", 1, "李奶奶", "女", 84, "一级护理", ["糖尿病", "用药提醒"], "女儿：李晓云", "139****1024", "128/80", "74"),
        elder("elder-demo-103", "103", 1, "张爷爷", "男", 79, "二级护理", ["卧床", "翻身护理"], "儿子：张建华", "137****3301", "130/83", "70"),
        elder("elder-demo-201", "201", 2, "陈奶奶", "女", 86, "二级护理", ["晨间巡视", "助行"], "外孙：陈宇", "136****2001", "126/79", "73"),
        elder("elder-demo-202", "202", 2, "赵大爷", "男", 81, "一级护理", ["独立进食", "午间观察"], "侄子：赵岩", "135****2218", "122/78", "71"),
        elder("elder-demo-203", "203", 2, "胡奶奶", "女", 87, "三级护理", ["重点观察", "需拍照"], "女儿：胡敏", "135****2030", "138/86", "77"),
        elder("elder-demo-301", "301", 3, "孙奶奶", "女", 83, "二级护理", ["助餐", "助浴"], "儿子：孙平", "134****3017", "129/81", "76"),
        elder("elder-demo-302", "302", 3, "刘大爷", "男", 80, "一级护理", ["日常巡房"], "女儿：刘青", "134****3020", "121/78", "69"),
        elder("elder-demo-401", "401", 4, "何爷爷", "男", 85, "二级护理", ["康复训练", "助行"], "儿子：何明", "133****4010", "132/84", "75"),
        elder("elder-demo-402", "402", 4, "黄奶奶", "女", 88, "三级护理", ["卧床", "重点翻身"], "女儿：黄婉", "133****4020", "140/88", "78"),
        elder("elder-demo-501", "501", 5, "周爷爷", "男", 88, "三级护理", ["重点观察", "夜间巡房"], "女儿：周敏", "133****5001", "142/88", "75"),
        elder("elder-demo-505", "505", 5, "冯奶奶", "女", 85, "二级护理", ["血压复测", "重点回访"], "孙女：冯瑶", "130****5005", "155/96", "78"),
    ]

    template = {
        "id": template_id,
        "institutionId": institution_id,
        "institutionName": institution_name,
        "version": 2,
        "title": template_title,
        "description": "演示用日报模板：模拟中午 12:10 的执行状态，前几天日报已收齐。",
        "careLevel": "all",
        "updatedAt": now,
        "updatedBy": "demo-seed",
        "source": "demo-seed",
        "sections": [
            {
                "id": "demo-life-care",
                "title": "生活照料",
                "items": [
                    {"id": "demo-room-tidy", "label": "房间整理", "frequencyDays": 1, "timeWindow": "06:30-06:50"},
                    {"id": "demo-assist-getup", "label": "协助起床", "frequencyDays": 1, "timeWindow": "07:00-07:20"},
                    {"id": "demo-wash-face", "label": "洗脸刷牙", "frequencyDays": 1, "timeWindow": "07:20-07:40"},
                    {"id": "demo-toilet-clean", "label": "卫生间清洁", "frequencyDays": 1, "timeWindow": "08:10-08:30"},
                    {"id": "demo-change-clothes", "label": "更换衣物", "frequencyDays": 1, "timeWindow": "16:00-16:15"},
                ],
            },
            {
                "id": "demo-meal-care",
                "title": "饮食照料",
                "items": [
                    {"id": "demo-breakfast", "label": "早餐助餐", "frequencyDays": 1, "timeWindow": "08:30-09:00", "requirePhoto": True},
                    {"id": "demo-water", "label": "饮水提醒", "frequencyDays": 1, "timeWindow": "09:30-09:40"},
                    {"id": "demo-lunch", "label": "午餐助餐", "frequencyDays": 1, "timeWindow": "11:30-12:00", "requirePhoto": True},
                    {"id": "demo-dinner", "label": "晚餐助餐", "frequencyDays": 1, "timeWindow": "17:30-18:00", "requirePhoto": True},
                ],
            },
            {
                "id": "demo-care-support",
                "title": "护理协助",
                "items": [
                    {"id": "demo-turning", "label": "翻身护理", "frequencyDays": 1, "timeWindow": "10:00-10:15", "requirePhoto": True},
                    {"id": "demo-medication", "label": "午前用药", "frequencyDays": 1, "timeWindow": "10:45-11:00", "requirePhoto": True},
                    {"id": "demo-walk", "label": "协助行走", "frequencyDays": 1, "timeWindow": "14:30-14:50"},
                ],
            },
            {
                "id": "demo-health-monitor",
                "title": "健康监测",
                "items": [
                    {"id": "demo-temperature", "label": "测量体温", "frequencyDays": 1, "timeWindow": "07:45-07:55"},
                    {"id": "demo-blood-pressure", "label": "测量血压", "frequencyDays": 1, "timeWindow": "15:00-15:10"},
                    {"id": "demo-night-patrol", "label": "晚间巡房", "frequencyDays": 1, "timeWindow": "19:30-19:45", "requirePhoto": True},
                ],
            },
        ],
    }

    rooms_by_floor: dict[str, list[dict]] = {}
    for item in elders:
        rooms_by_floor.setdefault(str(item["floor"]), []).append(
            {"elderId": item["id"], "room": item["room"], "bed": item["bed"], "elderName": item["name"]}
        )

    caregiver_by_floor = {int(caregiver["floor"]): caregiver for caregiver in caregivers}

    elder_care_plans = [
        {
            "id": f"plan-{item['id']}",
            "elderId": item["id"],
            "level": item["level"],
            "reviewCycle": "每周复核",
            "note": f"按青禾标准护理日报执行，重点关注{'、'.join(item['tags'])}。",
            "items": [],
        }
        for item in elders
    ]

    def caregiver_for(elder_item: dict) -> dict:
        return caregiver_by_floor.get(int(elder_item["floor"]), caregivers[0])

    all_item_ids = [item["id"] for _, item in template_items(template)]
    noon_minutes = parse_start_minutes(DEMO_NOON_TIME)
    risk_keys = {
        ("elder-demo-103", "demo-turning"): "老人晨间翻身时表示腰部疼痛，已拍照留痕并上报。",
        ("elder-demo-505", "demo-temperature"): "体温偏高并伴随头晕，已通知院长安排复测。",
    }
    missed_keys = {
        ("elder-demo-102", "demo-lunch"): "午餐助餐未在 12:00 前完成，等待老人用餐意愿恢复。",
        ("elder-demo-301", "demo-medication"): "午前用药等待复核药盒，暂未完成。",
        ("elder-demo-402", "demo-breakfast"): "早餐助餐已到点未完成，护工正在补处理。",
    }

    def make_report(elder_item: dict, record_date: str, completed_ids: list[str], issue_text: str = "") -> dict:
        caregiver = caregiver_for(elder_item)
        has_issue = bool(issue_text)
        report_items = {item_id: item_id in completed_ids for item_id in all_item_ids}
        return {
            "id": f"care-report-{elder_item['id']}-{record_date}",
            "institutionId": institution_id,
            "institutionName": institution_name,
            "elderId": elder_item["id"],
            "elderName": elder_item["name"],
            "gender": elder_item["gender"],
            "age": elder_item["age"],
            "room": elder_item["room"],
            "bed": elder_item["bed"],
            "careType": "semi-care",
            "careLevelLabel": elder_item["level"],
            "recordDate": record_date,
            "recordTime": "12:10" if record_date == today else "17:20",
            "caregiverId": caregiver["id"],
            "caregiverName": caregiver["name"],
            "reviewerName": "赵院长",
            "dailyCare": {},
            "reportItems": report_items,
            "reportTemplateSnapshot": template,
            "medication": {"morning": "用药" in "".join(elder_item["tags"]), "afternoon": False, "evening": False, "specialStatus": "none", "commonDrugs": ""},
            "health": {
                "none": not has_issue,
                "appetitePoor": False,
                "sleepPoor": False,
                "dizziness": has_issue,
                "nausea": False,
                "bowelIssue": False,
                "skinIssue": False,
                "fall": False,
                "other": issue_text,
                "treatment": "已在系统内留痕并通知院长。" if has_issue else "",
            },
            "inventory": {"medicine": "enough", "diaper": "enough", "pad": "enough", "supplies": "enough"},
            "signatures": {"caregiverSign": caregiver["name"], "reviewerSign": "赵院长", "remark": ""},
            "workflowStatus": "submitted",
            "syncStatus": "synced",
            "source": "demo-seed",
            "submittedAt": f"{record_date} {'12:10' if record_date == today else '17:20'}",
            "filledAt": f"{record_date} {'12:10' if record_date == today else '17:20'}",
            "updatedAt": f"{record_date} {'12:10' if record_date == today else '17:20'}",
        }

    previous_report_dates = [format_date(current - timedelta(days=offset)) for offset in (1, 2, 3)]
    previous_reports = [make_report(elder_item, date, all_item_ids) for date in previous_report_dates for elder_item in elders]

    due_by_noon = [
        item["id"]
        for _, item in template_items(template)
        if parse_start_minutes(item.get("timeWindow", "")) <= noon_minutes
    ]
    today_received_elder_ids = {"elder-demo-101", "elder-demo-102", "elder-demo-103", "elder-demo-201", "elder-demo-505"}
    today_reports = [
        make_report(
            elder_item,
            today,
            [item_id for item_id in due_by_noon if (elder_item["id"], item_id) not in missed_keys],
            "中午前发现异常，已进入闭环。" if elder_item["id"] in {"elder-demo-103", "elder-demo-505"} else "",
        )
        for elder_item in elders
        if elder_item["id"] in today_received_elder_ids
    ]
    daily_reports = previous_reports + today_reports

    generated_tasks: list[dict] = []
    for elder_item in elders:
        caregiver = caregiver_for(elder_item)
        for section, item in template_items(template):
            item_id = item["id"]
            key = (elder_item["id"], item_id)
            start_minutes = parse_start_minutes(item.get("timeWindow", ""))
            task_status = "pending"
            task_note = f"{section['title']} · 日报自动生成"
            if key in risk_keys:
                task_status = "risk"
                task_note = risk_keys[key]
            elif key in missed_keys:
                task_status = "pending"
                task_note = missed_keys[key]
            elif start_minutes <= noon_minutes:
                task_status = "completed"

            task_id = f"report-{today}-{elder_item['id']}-{section['id']}-{item_id}"
            generated_tasks.append(
                {
                    "id": task_id,
                    "taskId": task_id,
                    "institutionId": institution_id,
                    "institutionName": institution_name,
                    "recordDate": today,
                    "elderId": elder_item["id"],
                    "elderName": elder_item["name"],
                    "elderRoom": elder_item["room"],
                    "elderBed": elder_item["bed"],
                    "elderFloor": elder_item["floor"],
                    "caregiverId": caregiver["id"],
                    "caregiverName": caregiver["name"],
                    "defaultCaregiverId": caregiver["id"],
                    "defaultCaregiverName": caregiver["name"],
                    "planId": f"daily-report-{elder_item['id']}",
                    "planItemId": task_id,
                    "templateId": f"daily-report:{item_id}",
                    "title": item["label"],
                    "schedule": item.get("timeWindow", "").split("-", 1)[0],
                    "window": item.get("timeWindow", ""),
                    "requirePhoto": bool(item.get("requirePhoto")),
                    "status": task_status,
                    "note": task_note,
                    "category": section["title"],
                    "templateGroup": "daily-report",
                    "source": "report-template",
                    "sourceApp": "demo-seed",
                    "assignmentMode": "report-template",
                    "assignmentStatus": "published",
                    "workflowStatus": "published",
                    "publishedAt": f"{today} 06:00",
                    "acceptedAt": f"{today} 06:05",
                    "cloudTaskId": task_id,
                    "updatedAt": now,
                }
            )

    temporary_task = {
        "id": f"demo-temp-{today}-102-bp",
        "taskId": f"demo-temp-{today}-102-bp",
        "institutionId": institution_id,
        "institutionName": institution_name,
        "recordDate": today,
        "elderId": "elder-demo-102",
        "elderName": "李奶奶",
        "elderRoom": "102",
        "elderBed": "102-1床",
        "elderFloor": 1,
        "caregiverId": "caregiver-demo-01",
        "caregiverName": "张建国",
        "defaultCaregiverId": "caregiver-demo-01",
        "defaultCaregiverName": "张建国",
        "title": "临时血压复测",
        "description": "演示临时任务：午后复测血压并记录结果。",
        "schedule": "15:30",
        "window": "15:30-16:00",
        "requirePhoto": False,
        "status": "pending",
        "source": "temporary",
        "sourceApp": "demo-seed",
        "templateGroup": "temporary",
        "assignmentMode": "temporary",
        "assignmentStatus": "published",
        "workflowStatus": "published",
        "publishedAt": now,
        "updatedAt": now,
    }
    all_tasks = generated_tasks + [temporary_task]

    snapshot = {
        "institutionId": institution_id,
        "institutionName": institution_name,
        "dataSchemaVersion": 1,
        "updatedAt": now,
        "source": "demo-seed",
        "taskInfo": {
            "dailyReportTemplate": template,
            "elderCarePlans": elder_care_plans,
            "dailyReports": daily_reports,
            "temporaryTasks": all_tasks,
            "reportTemplateId": template_id,
            "demoScenario": {
                "label": "中午 12:10 演示状态",
                "currentDate": today,
                "previousReportDates": previous_report_dates,
                "completedBeforeNoon": len([task for task in generated_tasks if task["status"] == "completed"]),
                "riskBeforeNoon": len([task for task in generated_tasks if task["status"] == "risk"]),
                "pendingCount": len([task for task in generated_tasks if task["status"] == "pending"]),
            },
            "updatedAt": now,
        },
        "personnelInfo": {"caregivers": caregivers, "elders": elders, "updatedAt": now},
        "institutionInfo": {
            "institution": {
                "id": institution_id,
                "name": institution_name,
                "taskMode": "daily-report-driven",
                "address": "青禾镇康养路 18 号",
                "floorCount": 5,
                "roomCount": 18,
            },
            "floorCount": 5,
            "roomCount": 18,
            "roomsByFloor": rooms_by_floor,
            "dailyReportTemplateId": template_id,
            "inventory": {
                "categories": ["药品", "护理耗材", "清洁用品", "日用品"],
                "warningCount": 2,
                "items": [
                    {"id": "inv-demo-01", "name": "成人护理垫", "stock": 68, "limit": 80, "unit": "包", "status": "偏低"},
                    {"id": "inv-demo-02", "name": "一次性手套", "stock": 260, "limit": 100, "unit": "盒", "status": "充足"},
                    {"id": "inv-demo-03", "name": "消毒酒精", "stock": 12, "limit": 20, "unit": "瓶", "status": "偏低"},
                ],
            },
            "updatedAt": now,
        },
    }
    return template, snapshot, daily_reports, all_tasks


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--institution-id", default="demo-qinghe-care")
    parser.add_argument("--institution-name", default="青禾镇颐养护理院")
    args = parser.parse_args()

    props = read_local_properties()
    base_url = args.base_url or props.get("cloud.apiBaseUrl", "")
    api_key = args.api_key or props.get("cloud.apiKey", "")
    if not base_url:
        raise SystemExit("Missing cloud base url")
    if not api_key:
        raise SystemExit("Missing cloud api key")

    template, snapshot, daily_reports, all_tasks = build_demo_payload(args.institution_id, args.institution_name)
    template_resp = post_json(base_url, api_key, "/api/daily-report-template", template)
    state_resp = post_json(base_url, api_key, "/api/institution-state", snapshot)

    uploaded_reports, report_errors = post_many_json(base_url, api_key, "/api/care-records", daily_reports)
    uploaded_tasks, task_errors = post_many_json(base_url, api_key, "/api/tasks", all_tasks)

    scenario = snapshot["taskInfo"]["demoScenario"]
    print(
        json.dumps(
            {
                "status": "success",
                "institutionId": args.institution_id,
                "institutionName": args.institution_name,
                "templateStatus": template_resp.get("status"),
                "stateStatus": state_resp.get("status"),
                "caregivers": len(snapshot["personnelInfo"]["caregivers"]),
                "elders": len(snapshot["personnelInfo"]["elders"]),
                "templateItems": sum(len(section["items"]) for section in template["sections"]),
                "dailyReports": uploaded_reports,
                "cloudTasks": uploaded_tasks,
                "reportErrors": len(report_errors),
                "taskErrors": len(task_errors),
                "demoScenario": scenario,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
