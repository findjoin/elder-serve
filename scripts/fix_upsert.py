"""Fix upsert_published_task: merge raw_payload instead of replacing, guard explicit columns."""
import sys

with open('/home/ubuntu/elder_backend/main.py', 'r') as f:
    content = f.read()

# Fix 1: Merge raw_payload instead of replacing
old1 = '''    existing.raw_payload = payload
    existing.updated_at = normalize_text(request.updatedAt) or current_time

    db.commit()
    db.refresh(existing)

    return {
        "status": "success",
        "item": task_to_dict(existing),
        "fetchedAt": now_iso(),
    }


@app.get("/api/tasks")'''

new1 = '''    # Merge incoming payload into existing raw_payload to preserve structural fields
    existing_raw = dict(existing.raw_payload or {})
    for k, v in payload.items():
        if v is not None and v != "" and v != [] and v != {}:
            existing_raw[k] = v
    existing.raw_payload = existing_raw
    existing.updated_at = normalize_text(request.updatedAt) or current_time

    db.commit()
    db.refresh(existing)

    return {
        "status": "success",
        "item": task_to_dict(existing),
        "fetchedAt": now_iso(),
    }


@app.get("/api/tasks")'''

if old1 in content:
    content = content.replace(old1, new1)
    print('Fix 1 applied (raw_payload merge)')
else:
    print('Fix 1 NOT FOUND')
    sys.exit(1)

# Fix 2: Don't overwrite explicit columns with empty values
old2 = '''    existing.task_id = task_id
    existing.institution_id = normalize_text(request.institutionId) or "inst-001"
    existing.institution_name = normalize_text(request.institutionName)
    existing.record_date = normalize_text(request.recordDate)
    existing.elder_id = normalize_text(request.elderId)
    existing.elder_name = normalize_text(request.elderName)
    existing.elder_room = normalize_text(request.elderRoom)
    existing.elder_bed = normalize_text(request.elderBed)
    existing.elder_floor = normalize_text(request.elderFloor)
    existing.caregiver_id = normalize_text(request.caregiverId)
    existing.caregiver_name = normalize_text(request.caregiverName)'''

new2 = '''    existing.task_id = task_id
    existing.institution_id = normalize_text(request.institutionId) or existing.institution_id or "inst-001"
    if normalize_text(request.institutionName):
        existing.institution_name = normalize_text(request.institutionName)
    if normalize_text(request.recordDate):
        existing.record_date = normalize_text(request.recordDate)
    if normalize_text(request.elderId):
        existing.elder_id = normalize_text(request.elderId)
    if normalize_text(request.elderName):
        existing.elder_name = normalize_text(request.elderName)
    if normalize_text(request.elderRoom):
        existing.elder_room = normalize_text(request.elderRoom)
    if normalize_text(request.elderBed):
        existing.elder_bed = normalize_text(request.elderBed)
    if normalize_text(request.elderFloor):
        existing.elder_floor = normalize_text(request.elderFloor)
    if normalize_text(request.caregiverId):
        existing.caregiver_id = normalize_text(request.caregiverId)
    if normalize_text(request.caregiverName):
        existing.caregiver_name = normalize_text(request.caregiverName)'''

if old2 in content:
    content = content.replace(old2, new2)
    print('Fix 2 applied (explicit columns guard 1)')
else:
    print('Fix 2 NOT FOUND')
    sys.exit(1)

# Fix 3: More explicit columns
old3 = '''    existing.default_caregiver_id = normalize_text(request.defaultCaregiverId)
    existing.default_caregiver_name = normalize_text(request.defaultCaregiverName)
    existing.plan_id = normalize_text(request.planId)
    existing.plan_item_id = normalize_text(request.planItemId)
    existing.template_id = normalize_text(request.templateId)
    existing.title = normalize_text(request.title) or "director-task"
    existing.schedule = normalize_text(request.schedule)
    existing.window = normalize_text(request.window) or normalize_text(request.schedule)
    existing.require_photo = "true" if bool(request.requirePhoto) else "false"
    existing.status = normalize_text(request.status) or "pending"
    if normalize_text(request.exceptionNote) or normalize_text(request.exceptionType):
        existing.status = "risk"
        payload["status"] = "risk"
    existing.note = normalize_text(request.note)
    existing.category = normalize_text(request.category)
    existing.template_group = normalize_text(request.templateGroup) or "special"
    existing.source = normalize_text(request.source) or "manual"
    existing.source_app = normalize_text(request.sourceApp) or "director-app"
    existing.assignment_mode = normalize_text(request.assignmentMode) or "manual"
    existing.assignment_status = normalize_text(request.assignmentStatus) or "published"
    existing.workflow_status = normalize_text(request.workflowStatus) or "published"
    existing.published_at = normalize_text(request.publishedAt)
    existing.accepted_at = normalize_text(request.acceptedAt)
    existing.cloud_task_id = normalize_text(request.cloudTaskId) or task_id'''

new3 = '''    if normalize_text(request.defaultCaregiverId):
        existing.default_caregiver_id = normalize_text(request.defaultCaregiverId)
    if normalize_text(request.defaultCaregiverName):
        existing.default_caregiver_name = normalize_text(request.defaultCaregiverName)
    if normalize_text(request.planId):
        existing.plan_id = normalize_text(request.planId)
    if normalize_text(request.planItemId):
        existing.plan_item_id = normalize_text(request.planItemId)
    if normalize_text(request.templateId):
        existing.template_id = normalize_text(request.templateId)
    existing.title = normalize_text(request.title) or existing.title or "director-task"
    if normalize_text(request.schedule):
        existing.schedule = normalize_text(request.schedule)
    if normalize_text(request.window):
        existing.window = normalize_text(request.window)
    elif normalize_text(request.schedule):
        existing.window = normalize_text(request.schedule)
    existing.require_photo = "true" if bool(request.requirePhoto) else "false"
    existing.status = normalize_text(request.status) or existing.status or "pending"
    if normalize_text(request.exceptionNote) or normalize_text(request.exceptionType):
        existing.status = "risk"
        payload["status"] = "risk"
    if normalize_text(request.note):
        existing.note = normalize_text(request.note)
    if normalize_text(request.category):
        existing.category = normalize_text(request.category)
    if normalize_text(request.templateGroup):
        existing.template_group = normalize_text(request.templateGroup)
    existing.source = normalize_text(request.source) or existing.source or "manual"
    if normalize_text(request.sourceApp):
        existing.source_app = normalize_text(request.sourceApp)
    if normalize_text(request.assignmentMode):
        existing.assignment_mode = normalize_text(request.assignmentMode)
    if normalize_text(request.assignmentStatus):
        existing.assignment_status = normalize_text(request.assignmentStatus)
    if normalize_text(request.workflowStatus):
        existing.workflow_status = normalize_text(request.workflowStatus)
    if normalize_text(request.publishedAt):
        existing.published_at = normalize_text(request.publishedAt)
    if normalize_text(request.acceptedAt):
        existing.accepted_at = normalize_text(request.acceptedAt)
    existing.cloud_task_id = normalize_text(request.cloudTaskId) or existing.cloud_task_id or task_id'''

if old3 in content:
    content = content.replace(old3, new3)
    print('Fix 3 applied (explicit columns guard 2)')
else:
    print('Fix 3 NOT FOUND')
    sys.exit(1)

with open('/home/ubuntu/elder_backend/main.py', 'w') as f:
    f.write(content)
print('All fixes applied, file saved')
