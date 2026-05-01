function getRuntimeDate() {
  return new Intl.DateTimeFormat("sv-SE").format(new Date());
}

const runtimeDate = getRuntimeDate();

const elders = [
  {
    id: "elder-101",
    room: "101",
    bed: "101-1床",
    floor: 1,
    name: "王大爷",
    gender: "男",
    age: 82,
    level: "二级护理",
    tags: ["高血压", "晨间协助"],
    reportTemplateId: "daily-report-basic",
    reportTemplateTitle: "测试日报模板（15项）",
    familyContact: "长子：王建设",
    familyPhone: "138****8888",
    latestBloodPressure: "135/85",
    latestHeartRate: "72",
  },
  {
    id: "elder-102",
    room: "102",
    bed: "102-1床",
    floor: 1,
    name: "李奶奶",
    gender: "女",
    age: 84,
    level: "一级护理",
    tags: ["糖尿病", "用药提醒"],
    familyContact: "女儿：李晓云",
    familyPhone: "139****1024",
    latestBloodPressure: "128/80",
    latestHeartRate: "74",
  },
  {
    id: "elder-103",
    room: "103",
    bed: "103-1床",
    floor: 1,
    name: "张爷爷",
    gender: "男",
    age: 79,
    level: "二级护理",
    tags: ["卧床", "翻身"],
    familyContact: "儿子：张建华",
    familyPhone: "137****3301",
    latestBloodPressure: "130/83",
    latestHeartRate: "70",
  },
  {
    id: "elder-201",
    room: "201",
    bed: "201-1床",
    floor: 2,
    name: "陈奶奶",
    gender: "女",
    age: 86,
    level: "二级护理",
    tags: ["晨间巡视", "助行"],
    familyContact: "外孙：陈安",
    familyPhone: "136****2001",
    latestBloodPressure: "126/79",
    latestHeartRate: "73",
  },
  {
    id: "elder-202",
    room: "202",
    bed: "202-1床",
    floor: 2,
    name: "赵大爷",
    gender: "男",
    age: 81,
    level: "一级护理",
    tags: ["独立进食", "午间观察"],
    familyContact: "侄子：赵岗",
    familyPhone: "135****2218",
    latestBloodPressure: "122/78",
    latestHeartRate: "71",
  },
  {
    id: "elder-301",
    room: "301",
    bed: "301-1床",
    floor: 3,
    name: "孙奶奶",
    gender: "女",
    age: 83,
    level: "二级护理",
    tags: ["助餐", "助浴"],
    familyContact: "儿子：孙平",
    familyPhone: "134****3017",
    latestBloodPressure: "129/81",
    latestHeartRate: "76",
  },
  {
    id: "elder-501",
    room: "501",
    bed: "501-1床",
    floor: 5,
    name: "周爷爷",
    gender: "男",
    age: 88,
    level: "三级护理",
    tags: ["重点观察", "卧床"],
    familyContact: "女儿：周敏",
    familyPhone: "133****5001",
    latestBloodPressure: "142/88",
    latestHeartRate: "75",
  },
  {
    id: "elder-505",
    room: "505",
    bed: "505-1床",
    floor: 5,
    name: "冯奶奶",
    gender: "女",
    age: 85,
    level: "二级护理",
    tags: ["血压复测", "重点回访"],
    familyContact: "孙女：冯瑶",
    familyPhone: "130****5005",
    latestBloodPressure: "155/96",
    latestHeartRate: "78",
  },
];

const caregivers = [
  {
    id: "caregiver-01",
    name: "张建国",
    role: "金牌护工",
    employeeNo: "20260420",
    floor: 1,
    shift: "07:00 - 15:30",
    status: "off-duty",
  },
  {
    id: "caregiver-02",
    name: "李美兰",
    role: "护工组长",
    employeeNo: "20260421",
    floor: 2,
    shift: "07:00 - 15:30",
    status: "on-duty",
  },
  {
    id: "caregiver-03",
    name: "陈秀英",
    role: "机动护工",
    employeeNo: "20260422",
    floor: 3,
    shift: "07:00 - 15:30",
    status: "on-duty",
  },
  {
    id: "caregiver-04",
    name: "周桂芬",
    role: "晚班护工",
    employeeNo: "20260423",
    floor: 5,
    shift: "07:00 - 15:30",
    status: "on-duty",
  },
];

const taskTemplates = [
  {
    id: "template-wake-up",
    title: "晨间起床",
    group: "daily",
    groupLabel: "日常任务",
    category: "晨间护理",
    requirePhoto: false,
    batchEligible: true,
    appliesToLevels: ["一级护理", "二级护理", "三级护理"],
    defaultNote: "先确认老人精神状态，再协助离床。",
    isActive: true,
  },
  {
    id: "template-wash",
    title: "协助洗漱",
    group: "daily",
    groupLabel: "日常任务",
    category: "晨间护理",
    requirePhoto: false,
    batchEligible: true,
    appliesToLevels: ["一级护理", "二级护理", "三级护理"],
    defaultNote: "关注口腔与面部清洁情况。",
    isActive: true,
  },
  {
    id: "template-temperature",
    title: "晨间测温",
    group: "daily",
    groupLabel: "日常任务",
    category: "健康监测",
    requirePhoto: false,
    batchEligible: true,
    appliesToLevels: ["一级护理", "二级护理", "三级护理"],
    defaultNote: "测量后同步录入体温数据。",
    isActive: true,
  },
  {
    id: "template-feed-breakfast",
    title: "早餐助餐",
    group: "daily",
    groupLabel: "日常任务",
    category: "餐饮护理",
    requirePhoto: true,
    batchEligible: false,
    appliesToLevels: ["一级护理", "二级护理", "三级护理"],
    defaultNote: "记录进食量与饮水量。",
    isActive: true,
  },
  {
    id: "template-medication",
    title: "协助喂药",
    group: "daily",
    groupLabel: "日常任务",
    category: "用药护理",
    requirePhoto: false,
    batchEligible: false,
    appliesToLevels: ["一级护理", "二级护理", "三级护理"],
    defaultNote: "确认吞咽完成后再离开房间。",
    isActive: true,
  },
  {
    id: "template-turn-over",
    title: "翻身护理",
    group: "daily",
    groupLabel: "日常任务",
    category: "基础护理",
    requirePhoto: true,
    batchEligible: false,
    appliesToLevels: ["二级护理", "三级护理"],
    defaultNote: "翻身后观察皮肤受压部位。",
    isActive: true,
  },
  {
    id: "template-bp-recheck",
    title: "血压复测",
    group: "special",
    groupLabel: "特殊任务",
    category: "异常复核",
    requirePhoto: false,
    batchEligible: false,
    appliesToLevels: ["一级护理", "二级护理", "三级护理"],
    defaultNote: "异常值需同步院长端并记录复测结果。",
    isActive: true,
  },
  {
    id: "template-follow-up",
    title: "重点回访",
    group: "special",
    groupLabel: "特殊任务",
    category: "重点巡视",
    requirePhoto: true,
    batchEligible: false,
    appliesToLevels: ["二级护理", "三级护理"],
    defaultNote: "观察午后精神状态并留痕。",
    isActive: true,
  },
  {
    id: "template-bath",
    title: "助浴护理",
    group: "special",
    groupLabel: "特殊任务",
    category: "特殊护理",
    requirePhoto: true,
    batchEligible: false,
    appliesToLevels: ["二级护理", "三级护理"],
    defaultNote: "确认水温与防滑环境后再执行。",
    isActive: false,
  },
];

const dailyReportTemplate = {
  id: "daily-report-basic",
  version: 6,
  title: "测试日报模板（15项）",
  description: "用于验证日报任务能否按时间同步到护工端时间轴。",
  careLevel: "all",
  sections: [
    {
      id: "test-life-care",
      title: "生活照料",
      items: [
        { id: "test-room-tidy", label: "房间整理", frequencyDays: 1, timeWindow: "06:30-06:50" },
        { id: "test-wake-up", label: "协助起床", frequencyDays: 1, timeWindow: "07:00-07:20" },
        { id: "test-wash-face", label: "洗脸刷牙", frequencyDays: 1, timeWindow: "07:20-07:40" },
        { id: "test-toilet-clean", label: "卫生间清洁", frequencyDays: 1, timeWindow: "08:10-08:30" },
        { id: "test-clothes", label: "更换衣物", frequencyDays: 1, timeWindow: "16:00-16:15" },
      ],
    },
    {
      id: "test-meal-care",
      title: "饮食照料",
      items: [
        { id: "test-breakfast", label: "早餐助餐", frequencyDays: 1, timeWindow: "08:30-09:00", requirePhoto: true },
        { id: "test-water", label: "饮水提醒", frequencyDays: 1, timeWindow: "09:30-09:40" },
        { id: "test-lunch", label: "午餐助餐", frequencyDays: 1, timeWindow: "11:30-12:00", requirePhoto: true },
        { id: "test-dinner", label: "晚餐助餐", frequencyDays: 1, timeWindow: "17:30-18:00", requirePhoto: true },
      ],
    },
    {
      id: "test-care-support",
      title: "护理协助",
      items: [
        { id: "test-turning-morning", label: "上午翻身", frequencyDays: 1, timeWindow: "10:00-10:15", requirePhoto: true },
        { id: "test-medicine-noon", label: "午前用药", frequencyDays: 1, timeWindow: "10:45-11:00", requirePhoto: true },
        { id: "test-walk", label: "协助行走", frequencyDays: 1, timeWindow: "14:30-14:50" },
      ],
    },
    {
      id: "test-health-monitor",
      title: "健康监测",
      items: [
        { id: "test-temperature", label: "测量体温", frequencyDays: 1, timeWindow: "07:45-07:55" },
        { id: "test-blood-pressure", label: "测量血压", frequencyDays: 1, timeWindow: "15:00-15:10" },
        { id: "test-night-patrol", label: "晚间巡房", frequencyDays: 1, timeWindow: "19:30-19:45", requirePhoto: true },
      ],
    },
  ],
};

function cloneDailyReportTemplate(template = dailyReportTemplate) {
  return JSON.parse(JSON.stringify(template));
}

export function createReportTemplateItems(template = dailyReportTemplate, defaults = {}) {
  const nextItems = {};
  (template.sections || []).forEach((section) => {
    (section.items || []).forEach((item) => {
      nextItems[item.id] = Boolean(defaults[item.id]);
    });
  });
  return nextItems;
}

const elderCarePlans = [
  {
    id: "plan-101",
    elderId: "elder-101",
    level: "二级护理",
    reviewCycle: "每周复核",
    note: "晨起状态稳定，重点关注翻身与午前用药。",
    items: [
      { id: "plan-101-1", templateId: "template-wake-up", schedule: "07:20", assignment: "floor-owner", initialStatus: "completed", isEnabled: true },
      { id: "plan-101-2", templateId: "template-temperature", schedule: "07:35", assignment: "floor-owner", initialStatus: "completed", isEnabled: true },
      { id: "plan-101-3", templateId: "template-turn-over", schedule: "09:30", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
      { id: "plan-101-4", templateId: "template-medication", schedule: "11:30", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
    ],
  },
  {
    id: "plan-102",
    elderId: "elder-102",
    level: "一级护理",
    reviewCycle: "每周复核",
    note: "早餐助餐需留痕，用药按时段勾选确认，午后辅助洗漱暂不启用。",
    items: [
      { id: "plan-102-1", templateId: "template-feed-breakfast", schedule: "08:10", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
      { id: "plan-102-2", templateId: "template-medication", schedule: "10:10", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
      { id: "plan-102-3", templateId: "template-wash", schedule: "14:30", assignment: "floor-owner", initialStatus: "pending", isEnabled: false },
    ],
  },
  {
    id: "plan-103",
    elderId: "elder-103",
    level: "二级护理",
    reviewCycle: "每日晨会复核",
    note: "卧床老人需要院长灵活发布，避免晨间扎堆。",
    items: [
      { id: "plan-103-1", templateId: "template-turn-over", schedule: "09:20", assignment: "manual", initialStatus: "pending", isEnabled: true },
      { id: "plan-103-2", templateId: "template-bp-recheck", schedule: "14:10", assignment: "manual", initialStatus: "pending", isEnabled: true },
    ],
  },
  {
    id: "plan-201",
    elderId: "elder-201",
    level: "二级护理",
    reviewCycle: "每周复核",
    note: "晨间任务标准化执行。",
    items: [
      { id: "plan-201-1", templateId: "template-wake-up", schedule: "07:30", assignment: "floor-owner", initialStatus: "completed", isEnabled: true },
      { id: "plan-201-2", templateId: "template-wash", schedule: "07:45", assignment: "floor-owner", initialStatus: "completed", isEnabled: true },
      { id: "plan-201-3", templateId: "template-temperature", schedule: "08:40", assignment: "floor-owner", initialStatus: "completed", isEnabled: true },
    ],
  },
  {
    id: "plan-202",
    elderId: "elder-202",
    level: "一级护理",
    reviewCycle: "每周复核",
    note: "主要保留用药提醒，午后重点回访按院长决定启停。",
    items: [
      { id: "plan-202-1", templateId: "template-medication", schedule: "10:20", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
      { id: "plan-202-2", templateId: "template-follow-up", schedule: "15:10", assignment: "manual", initialStatus: "pending", isEnabled: false },
    ],
  },
  {
    id: "plan-301",
    elderId: "elder-301",
    level: "二级护理",
    reviewCycle: "每周复核",
    note: "三楼当前由机动护工负责，需兼顾助餐与翻身。",
    items: [
      { id: "plan-301-1", templateId: "template-feed-breakfast", schedule: "08:20", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
      { id: "plan-301-2", templateId: "template-turn-over", schedule: "13:50", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
    ],
  },
  {
    id: "plan-501",
    elderId: "elder-501",
    level: "三级护理",
    reviewCycle: "每日复核",
    note: "卧床老人午后需重点巡视。",
    items: [
      { id: "plan-501-1", templateId: "template-turn-over", schedule: "09:40", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
      { id: "plan-501-2", templateId: "template-follow-up", schedule: "14:20", assignment: "floor-owner", initialStatus: "pending", isEnabled: true },
    ],
  },
  {
    id: "plan-505",
    elderId: "elder-505",
    level: "二级护理",
    reviewCycle: "每日复核",
    note: "血压异常，复测与回访均由院长控制发布。",
    items: [
      { id: "plan-505-1", templateId: "template-bp-recheck", schedule: "09:10", assignment: "manual", initialStatus: "risk", isEnabled: true },
      { id: "plan-505-2", templateId: "template-follow-up", schedule: "15:00", assignment: "manual", initialStatus: "pending", isEnabled: true },
    ],
  },
];

const batchJobs = [
  { key: "lunch", title: "午餐助餐", total: 12, icon: "meal", completed: false },
  { key: "wake-up", title: "晨间起床", total: 12, icon: "sun", completed: true },
  { key: "wash", title: "协助洗漱", total: 12, icon: "checkCircle", completed: true },
  { key: "night-round", title: "晚间巡房/提醒", total: 12, icon: "moon", completed: false },
  { key: "medicine-supplies", title: "统一发药/物品", total: 12, icon: "package", completed: false },
];

const vitals = [
  { elderId: "elder-101", bloodPressure: "135/85", bloodSugar: "5.6", temperature: "36.5", time: "07:35" },
  { elderId: "elder-102", bloodPressure: "128/80", bloodSugar: "6.1", temperature: "36.6", time: "08:15" },
  { elderId: "elder-505", bloodPressure: "155/96", bloodSugar: "5.8", temperature: "36.4", time: "09:05" },
];

const anomalies = [
  {
    id: "anomaly-1",
    type: "老人身体不适",
    level: "high",
    elderId: "elder-505",
    time: "10:18",
    status: "已同步院长端",
    note: "老人头晕，已卧床休息，等待复测结果。",
  },
  {
    id: "anomaly-2",
    type: "物资短缺",
    level: "medium",
    elderId: null,
    time: "10:40",
    status: "待采购",
    note: "护理垫余量不足，预计只够支撑到晚班前。",
  },
];

const messages = [
  { id: "message-1", title: "今日早班排班已确认", time: "06:40", read: false },
  { id: "message-2", title: "家属留言：请关注 505 室老人早餐情况", time: "07:12", read: false },
  { id: "message-3", title: "公告：本周物资盘点调整到周四", time: "09:55", read: true },
];

const history = [
  {
    id: "history-1",
    time: "2026-04-22 08:30",
    elderId: "elder-101",
    elder: "王大爷",
    room: "101",
    task: "早餐助餐",
    caregiver: "张建国",
    status: "已完成",
    photoLabel: "早餐留痕",
    details: "老人胃口较好，小米粥和鸡蛋均已进食完成。",
    steps: ["进入房间 (08:20)", "协助洗手 (08:22)", "递送餐点 (08:25)", "拍照留痕 (08:30)"],
    exception: "",
  },
  {
    id: "history-2",
    time: "2026-04-22 09:15",
    elderId: "elder-102",
    elder: "李奶奶",
    room: "102",
    task: "晨间洗漱",
    caregiver: "张建国",
    status: "老人不配合",
    photoLabel: "异常留痕",
    details: "老人情绪波动，暂时拒绝配合洗漱。",
    steps: ["进入房间 (09:05)", "尝试沟通 (09:08)", "情绪安抚 (09:12)"],
    exception: "老人起床后情绪较重，尝试沟通 5 分钟未果，建议稍后再次处理。",
  },
  {
    id: "history-3",
    time: "2026-04-21 18:00",
    elderId: "elder-103",
    elder: "张爷爷",
    room: "103",
    task: "晚间洗漱",
    caregiver: "张建国",
    status: "异常",
    photoLabel: "异常留痕",
    details: "发现老人左脚踝局部发红，已同步上报。",
    steps: ["基础护理 (17:45)", "局部检查 (17:50)", "上报医护 (18:00)"],
    exception: "左侧脚踝有明显红肿，触碰时有疼痛感，已通知值班医护并完成交接。",
  },
  {
    id: "history-4",
    time: "2026-04-20 10:00",
    elderId: "elder-201",
    elder: "陈奶奶",
    room: "201",
    task: "翻身拍背",
    caregiver: "李美兰",
    status: "已完成",
    photoLabel: "护理留痕",
    details: "完成翻身拍背后，皮肤状态良好。",
    steps: ["侧卧位调整 (10:00)", "轻拍背部 (10:05)", "皮肤检查 (10:10)"],
    exception: "",
  },
];

const family = {
  elder: {
    name: "李长青",
    relation: "父亲",
    room: "102室",
    stayDays: 452,
    stepCount: "3,420",
    sleepHours: "7.5 h",
    mood: "开心",
    latestBloodPressure: "124/82",
    bloodSugar: "5.8",
  },
  careSummary: {
    conclusion: "今日护理总体正常",
    handledCount: 6,
    totalCount: 7,
    latestTime: "10:30",
    caregiver: "张建国",
    shift: "早班",
    syncStatus: "已同步",
    evidence: "翻身护理已留痕",
  },
  medicationSummary: {
    conclusion: "上午用药已按时确认",
    status: "已处理",
    latestTime: "10:10",
    caregiver: "张建国",
    reviewer: "赵院长",
    source: "交班日报（提交）",
  },
  anomalySummary: {
    conclusion: "暂无未处理异常",
    status: "已回访",
    latestTime: "15:00",
    chain: ["护工上报", "院长已查看", "下午回访正常"],
    evidence: "处理链路已留痕",
  },
  contactPolicy: {
    title: "家属留言",
    description: "工作时间内由院方异步处理，紧急情况请直接电话联系院方。",
  },
  logs: [
    {
      id: "family-log-1",
      time: "10:30",
      title: "护理动作",
      description: "护工小张已协助翻身，并完成下肢按摩护理。",
      tone: "success",
    },
    {
      id: "family-log-2",
      time: "08:45",
      title: "早餐记录",
      description: "早餐进食：小米粥一碗、鸡蛋一个，胃口良好。",
      tone: "primary",
    },
  ],
  trendLabels: ["04/16", "04/17", "04/18", "04/19", "04/20", "04/21", "04/22"],
  trendValues: [120, 122, 118, 125, 124, 121, 124],
  moments: [
    { id: "moment-1", title: "手工课", subtitle: "上午活动", theme: "craft" },
    { id: "moment-2", title: "花园散步", subtitle: "午后时光", theme: "garden" },
  ],
  messages: [
    { id: "family-message-1", title: "今日护理已更新", preview: "10:30 已完成翻身护理并留痕。", time: "10:35", read: false },
    { id: "family-message-2", title: "健康提醒", preview: "今日血糖 5.8 mmol/L，状态平稳。", time: "09:10", read: false },
    { id: "family-message-3", title: "院方公告", preview: "本周家属探视时间调整为周六下午。", time: "昨日", read: true },
  ],
};

const director = {
  date: runtimeDate,
  reviewerName: "赵院长",
  role: "院长",
  accountId: "director-001",
  phone: "138****0000",
  inventorySummary: { types: 32, warningCount: 5 },
  inventoryCategories: ["全部", "药品类", "护理用品", "日用品"],
  inventory: [
    { id: "inventory-1", name: "降压片（A型）", type: "药品类", spec: "10mg*30片", stock: 12, limit: 20, location: "1F药库", status: "不足" },
    { id: "inventory-2", name: "成人护理垫", type: "护理用品", spec: "10片/包", stock: 45, limit: 100, location: "仓库A", status: "偏低" },
    { id: "inventory-3", name: "医用手套", type: "护理用品", spec: "100只/盒", stock: 120, limit: 50, location: "仓库B", status: "充足" },
    { id: "inventory-4", name: "消毒酒精", type: "日用品", spec: "500ml/瓶", stock: 8, limit: 10, location: "1F护理站", status: "不足" },
  ],
  anomalyRecords: [
    {
      id: "director-anomaly-1",
      time: "10:18",
      type: "老人身体不适",
      elder: "冯奶奶",
      room: "505",
      description: "老人头晕，已卧床休息，等待复测结果。",
      followUp: "值班护士已介入",
      photoLabel: "现场照片",
    },
    {
      id: "director-anomaly-2",
      time: "10:40",
      type: "物资短缺",
      elder: "公共物资",
      room: "仓库A",
      description: "护理垫库存不足，建议当日补货。",
      followUp: "已发采购提醒",
      photoLabel: "库存留痕",
    },
  ],
  floorDetails: {
    "1F": {
      completion: "61%",
      elders: [
        { name: "王大爷", room: "101", status: "进行中", anomaly: "" },
        { name: "李奶奶", room: "102", status: "未完成", anomaly: "" },
        { name: "张爷爷", room: "103", status: "待分配", anomaly: "翻身待分配" },
      ],
    },
    "2F": {
      completion: "75%",
      elders: [
        { name: "陈奶奶", room: "201", status: "已完成", anomaly: "" },
        { name: "赵大爷", room: "202", status: "进行中", anomaly: "" },
      ],
    },
    "3F": {
      completion: "50%",
      elders: [{ name: "孙奶奶", room: "301", status: "进行中", anomaly: "" }],
    },
    "5F": {
      completion: "33%",
      elders: [
        { name: "周爷爷", room: "501", status: "进行中", anomaly: "" },
        { name: "冯奶奶", room: "505", status: "待分配", anomaly: "血压异常复测" },
      ],
    },
  },
  timelines: [
    {
      elderName: "王大爷",
      room: "101",
      level: "二级护理",
      entries: [
        { time: "07:20", title: "晨间起床", note: "已完成起床协助，状态稳定。" },
        { time: "07:35", title: "晨间测温", note: "体温 36.5℃，已同步健康档案。" },
        { time: "09:30", title: "翻身护理", note: "待执行，默认由 1 楼护工继续完成。" },
      ],
    },
    {
      elderName: "冯奶奶",
      room: "505",
      level: "二级护理",
      entries: [
        { time: "09:10", title: "血压复测", note: "任务待分配，老人上午有头晕反馈。" },
        { time: "10:18", title: "异常上报", note: "已同步值班护士与院长端。" },
        { time: "15:00", title: "重点回访", note: "计划下午再次复查状态并拍照留痕。" },
      ],
    },
  ],
};

function getTemplateById(templateId, templates = taskTemplates) {
  return templates.find((item) => item.id === templateId);
}

function getElderById(elderId, elderList = elders) {
  return elderList.find((item) => item.id === elderId);
}

function getCaregiverForFloor(floor, caregiverList = caregivers) {
  return caregiverList.find((item) => item.floor === floor) || caregiverList[0];
}

function parseScheduleStart(value = "") {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return "08:00";
  return `${String(Math.min(23, Math.max(0, Number(match[1]) || 0))).padStart(2, "0")}:${String(
    Math.min(59, Math.max(0, Number(match[2]) || 0)),
  ).padStart(2, "0")}`;
}

function isReportTemplateItemDue(item = {}, recordDate = runtimeDate) {
  const frequencyDays = Math.max(1, Number(item.frequencyDays || item.frequency || 1));
  if (frequencyDays <= 1) return true;
  const day = Number(String(recordDate || runtimeDate).slice(-2)) || 1;
  return (day - 1) % frequencyDays === 0;
}

const CARE_RECORD_LEVEL_MAP = {
  "一级护理": { value: "self-care", label: "自理" },
  "二级护理": { value: "semi-care", label: "半自理" },
  "三级护理": { value: "full-care", label: "全护理" },
};

function mapLevelToCareRecordLevel(level) {
  return CARE_RECORD_LEVEL_MAP[level] || CARE_RECORD_LEVEL_MAP["二级护理"];
}

export function createCareRecordDraft({
  elderId = elders[0]?.id || "",
  recordDate = director.date,
  recordTime = "15:30",
  institutionName = "青禾镇颐养护理院",
  reviewerName = "",
  caregiverName = "",
  elders: elderList = elders,
  caregivers: caregiverList = caregivers,
  reportTemplate = dailyReportTemplate,
} = {}) {
  const elder = getElderById(elderId, elderList) || elderList[0] || null;
  const defaultCaregiver = elder ? getCaregiverForFloor(elder.floor, caregiverList) : caregiverList[0] || null;
  const careLevel = mapLevelToCareRecordLevel(elder?.level);
  const requiresAssist = careLevel.value !== "self-care";
  const needsPadCare = careLevel.value === "full-care";
  const likelyMedication = Boolean(
    elder?.tags?.some((tag) => String(tag).includes("用药") || String(tag).includes("高血压") || String(tag).includes("糖尿病")),
  );
  const defaultReportItems = createReportTemplateItems(reportTemplate, {
    "room-tidy": true,
    "floor-clean": true,
    "assist-getup": true,
    "oral-clean": true,
    "face-clean": true,
    "dress-tidy": true,
    "wash-face": true,
    "brush-teeth": true,
    "comb-hair": true,
    "deliver-meal": true,
    feeding: true,
    water: true,
    "tableware-clean": true,
    turning: requiresAssist,
    "walk-assist": requiresAssist,
    "stand-sit": requiresAssist,
    "blood-pressure": likelyMedication,
    "body-status": true,
  });

  return {
    institutionName,
    elderId: elder?.id || "",
    elderName: elder?.name || "",
    gender: elder?.gender || "",
    age: elder?.age || "",
    room: elder?.room || "",
    bed: elder?.bed || "",
    careType: careLevel.value,
    careLevelLabel: careLevel.label,
    recordDate,
    recordTime,
    caregiverName: caregiverName || defaultCaregiver?.name || "",
    reviewerName: reviewerName || "",
    dailyCare: {
      morningCare: true,
      eveningCare: false,
      feedingWater: true,
      feedingMeal: true,
      hygiene: true,
      dressing: true,
      turning: requiresAssist,
      toiletAssist: requiresAssist,
      diaperPadChange: needsPadCare,
      bathWipe: false,
    },
    medication: {
      morning: likelyMedication,
      afternoon: false,
      evening: false,
      specialStatus: "none",
      commonDrugs: "",
    },
    health: {
      none: true,
      appetitePoor: false,
      sleepPoor: false,
      dizziness: false,
      nausea: false,
      bowelIssue: false,
      skinIssue: false,
      fall: false,
      other: "",
      treatment: "",
    },
    inventory: {
      medicine: "enough",
      diaper: "enough",
      pad: "enough",
      supplies: "enough",
    },
    signatures: {
      caregiverSign: "",
      reviewerSign: "",
      remark: "",
    },
    reportItems: defaultReportItems,
    reportTemplateSnapshot: cloneDailyReportTemplate(reportTemplate),
    filledAt: "",
  };
}

export function createDirectorCareRecordDraft(options = {}) {
  return createCareRecordDraft({
    reviewerName: director.reviewerName,
    ...options,
  });
}

export function buildTasksFromConfiguration({
  elderCarePlans,
  taskTemplates,
  elders,
  caregivers,
  dailyReportTemplate: reportTemplate = null,
  recordDate = runtimeDate,
  previousTasks = [],
}) {
  const previousByPlanItemId = new Map(previousTasks.map((task) => [task.planItemId, task]));
  const nextSeed =
    previousTasks.reduce((max, task) => {
      const match = /task-(\d+)/.exec(task.id || "");
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

  let taskCounter = nextSeed;
  const tasks = [];

  elderCarePlans.forEach((plan) => {
    const elder = getElderById(plan.elderId, elders);
    if (!elder) return;

    plan.items.forEach((item) => {
      const template = getTemplateById(item.templateId, taskTemplates);
      if (!template || !template.isActive || item.isEnabled === false) return;

      const previousTask = previousByPlanItemId.get(item.id);
      const floorOwner = getCaregiverForFloor(elder.floor, caregivers);
      const defaultCaregiverId = item.assignment === "floor-owner" ? floorOwner?.id || "" : "";
      const caregiverId = previousTask ? previousTask.caregiverId : defaultCaregiverId;
      const assignmentStatus = previousTask?.assignmentStatus || (caregiverId ? "accepted" : "unassigned");

      tasks.push({
        id: previousTask?.id || `task-${taskCounter++}`,
        planId: plan.id,
        planItemId: item.id,
        elderId: elder.id,
        caregiverId,
        defaultCaregiverId,
        templateId: template.id,
        title: item.title || template.title,
        schedule: item.schedule,
        window: item.schedule,
        requirePhoto: item.requirePhoto ?? template.requirePhoto,
        status: previousTask?.status || item.initialStatus || "pending",
        note: item.note || template.defaultNote,
        category: template.category,
        templateGroup: template.group,
        source: previousTask?.source || (item.assignment === "manual" ? "manual" : "plan"),
        assignmentMode: item.assignment,
        assignmentStatus,
        publishedAt: previousTask?.publishedAt || "",
        acceptedAt: previousTask?.acceptedAt || (assignmentStatus === "accepted" ? previousTask?.acceptedAt || "" : ""),
      });
    });
  });

  if (reportTemplate?.sections?.length) {
    const reportTemplateCareLevel = reportTemplate.careLevel || "all";
    const reportTemplateId = reportTemplate.id || "daily-report-basic";
    const hasReportTemplateAssignments = elders.some((elder) => elder.reportTemplateId);
    elders.forEach((elder) => {
      if (hasReportTemplateAssignments && elder.reportTemplateId !== reportTemplateId) return;
      if (reportTemplateCareLevel !== "all" && elder.level !== reportTemplateCareLevel) return;

      const floorOwner = getCaregiverForFloor(elder.floor, caregivers);
      const existingResponsibleTask = tasks.find((task) => {
        const caregiver = caregivers.find((item) => item.id === task.caregiverId);
        return task.elderId === elder.id && caregiver && caregiver.floor === elder.floor;
      });
      const defaultCaregiverId = existingResponsibleTask?.caregiverId || floorOwner?.id || "";

      reportTemplate.sections.forEach((section) => {
        (section.items || []).forEach((item) => {
          if (!item?.id || !isReportTemplateItemDue(item, recordDate)) return;

          const planItemId = `report-${recordDate}-${elder.id}-${section.id}-${item.id}`;
          const previousTask = previousByPlanItemId.get(planItemId);
          const caregiverId = previousTask ? previousTask.caregiverId : defaultCaregiverId;
          const assignmentStatus = previousTask?.assignmentStatus || (caregiverId ? "published" : "unassigned");
          const schedule = parseScheduleStart(item.timeWindow);

          tasks.push({
            id: previousTask?.id || planItemId,
            planId: `daily-report-${elder.id}`,
            planItemId,
            elderId: elder.id,
            caregiverId,
            defaultCaregiverId,
            templateId: `daily-report:${item.id}`,
            title: item.label || "日报护理任务",
            schedule,
            window: item.timeWindow || schedule,
            requirePhoto: Boolean(item.requirePhoto),
            status: previousTask?.status || "pending",
            note: `${section.title || "日报模板"} · 日报自动生成`,
            category: section.title || "日报模板",
            templateGroup: "daily-report",
            source: previousTask?.source || "report-template",
            assignmentMode: "report-template",
            assignmentStatus,
            publishedAt: previousTask?.publishedAt || (caregiverId ? schedule : ""),
            acceptedAt: previousTask?.acceptedAt || "",
          });
        });
      });
    });
  }

  return tasks.sort((left, right) => {
    const bySchedule = left.schedule.localeCompare(right.schedule);
    if (bySchedule !== 0) return bySchedule;
    return left.elderId.localeCompare(right.elderId);
  });
}

export function buildDirectorOverview({ tasks, caregivers, elders }) {
  const expected = caregivers.length;
  const checkedIn = caregivers.filter((item) => item.status === "on-duty").length;
  const completed = tasks.filter((item) => item.status === "completed").length;
  const risk = tasks.filter((item) => item.status === "risk" || item.status === "refused").length;
  const issue = tasks.filter((item) => item.status === "risk").length;
  const refused = tasks.filter((item) => item.status === "refused").length;
  const handled = completed + risk;
  const executionRate = tasks.length ? `${((handled / tasks.length) * 100).toFixed(1)}%` : "0.0%";
  const issueRate = handled ? `${Math.round((issue / handled) * 100)}%` : "0%";
  const refusedRate = handled ? `${Math.round((refused / handled) * 100)}%` : "0%";

  return {
    attendance: {
      expected,
      checkedIn,
      missing: expected - checkedIn,
    },
    taskProgress: {
      total: tasks.length,
      completed,
      handled,
      pending: tasks.filter((item) => item.status === "pending").length,
      risk,
      issue,
      refused,
      rate: executionRate,
      executionRate,
      issueRate,
      refusedRate,
    },
    floors: [1, 2, 3, 4, 5].map((floor) => {
      const floorElders = elders.filter((item) => item.floor === floor);
      const floorTasks = tasks.filter((task) => {
        const elder = getElderById(task.elderId, elders);
        return elder && elder.floor === floor;
      });
      const floorCompleted = floorTasks.filter((item) => item.status === "completed").length;
      const floorRisk = floorTasks.filter((item) => item.status === "risk" || item.status === "refused").length;
      const floorIssue = floorTasks.filter((item) => item.status === "risk").length;
      const floorRefused = floorTasks.filter((item) => item.status === "refused").length;
      const floorHandled = floorCompleted + floorRisk;

      return {
        name: `${floor}F`,
        total: floorElders.length,
        handled: floorHandled,
        pending: floorTasks.filter((item) => item.status === "pending").length,
        rate: floorTasks.length ? `${Math.round((floorHandled / floorTasks.length) * 100)}%` : "0%",
        issueRate: floorHandled ? `${Math.round((floorIssue / floorHandled) * 100)}%` : "0%",
        refusedRate: floorHandled ? `${Math.round((floorRefused / floorHandled) * 100)}%` : "0%",
        error: floorRisk,
        status: floorRisk > 0 ? "error" : floorCompleted === floorTasks.length && floorTasks.length > 0 ? "success" : "normal",
      };
    }),
    statistics: [
      { id: "stat-1", label: "今日出勤率", value: expected ? `${Math.round((checkedIn / expected) * 100)}%` : "0%", tone: "success" },
      { id: "stat-2", label: "护工执行率", value: executionRate, tone: "primary" },
      { id: "stat-3", label: "异常占比", value: issueRate, tone: "error" },
      { id: "stat-4", label: "不配合占比", value: refusedRate, tone: "warning" },
    ],
  };
}

export function createMockState() {
  const tasks = buildTasksFromConfiguration({
    elderCarePlans,
    taskTemplates,
    elders,
    caregivers,
    dailyReportTemplate,
    recordDate: director.date,
  });
  const overview = buildDirectorOverview({ tasks, caregivers, elders });
  const directorCareRecordDraft = createDirectorCareRecordDraft({
    elderId: elders[0]?.id,
    recordDate: director.date,
    institutionName: "青禾镇颐养护理院",
    reviewerName: director.reviewerName,
    elders,
    caregivers,
  });
  const seededCareReports = [
    {
      ...createCareRecordDraft({
        elderId: "elder-102",
        recordDate: director.date,
        recordTime: "15:35",
        institutionName: "青禾镇颐养护理院",
        reviewerName: director.reviewerName,
        elders,
        caregivers,
      }),
      id: "report-elder-102-2026-04-22",
      syncStatus: "synced",
      submittedAt: "2026-04-22 15:35",
      updatedAt: "2026-04-22 15:35",
      medication: {
        morning: true,
        afternoon: false,
        evening: false,
        specialStatus: "taken",
        commonDrugs: "降压片",
      },
      signatures: {
        caregiverSign: "张建国",
        reviewerSign: "赵院长",
        remark: "午后状态平稳，继续关注进食与用药。",
      },
    },
    {
      ...createCareRecordDraft({
        elderId: "elder-505",
        recordDate: director.date,
        recordTime: "16:10",
        institutionName: "青禾镇颐养护理院",
        reviewerName: director.reviewerName,
        elders,
        caregivers,
      }),
      id: "report-elder-505-2026-04-22",
      syncStatus: "synced",
      submittedAt: "2026-04-22 16:10",
      updatedAt: "2026-04-22 16:10",
      health: {
        none: false,
        appetitePoor: false,
        sleepPoor: false,
        dizziness: true,
        nausea: false,
        bowelIssue: false,
        skinIssue: false,
        fall: false,
        other: "上午头晕",
        treatment: "已电话通知院长，完成血压复测并安排 15:00 重点回访。",
      },
      signatures: {
        caregiverSign: "周桂芳",
        reviewerSign: "赵院长",
        remark: "异常已进入回访闭环，晚班继续观察。",
      },
    },
  ];

  return {
    institution: {
      id: "demo-qinghe-care",
      name: "青禾镇颐养护理院",
      taskMode: "template-plan-assignment",
    },
    caregiver: {
      ...caregivers[0],
    },
    caregivers,
    taskTemplates,
    dailyReportTemplate: cloneDailyReportTemplate(dailyReportTemplate),
    elderCarePlans,
    family,
    director: {
      ...director,
      attendance: overview.attendance,
      taskProgress: overview.taskProgress,
      floors: overview.floors,
      statistics: overview.statistics,
    },
    session: {
      identity: "",
      loggedIn: false,
      clockInAt: "",
      clockOutAt: "",
      clockInLocation: "",
      clockInLocationRaw: null,
    },
    ui: {
      route: "login",
      loginMenuOpen: false,
      appInfoDialog: "",
      appUpdate: {
        open: false,
        status: "idle",
        message: "",
        progress: 0,
        release: null,
      },
      activeTab: "home",
      selectedFloor: 1,
      selectedRoom: "101",
      selectedElderId: "elder-101",
      selectedTaskId: tasks.find((item) => item.caregiverId === caregivers[0].id && item.status !== "completed")?.id || "",
      selectedHistoryId: "history-1",
      selectedDirectorFloor: "1F",
      selectedDirectorElder: "王大爷",
      selectedDirectorPlanFloor: 1,
      selectedDirectorPlanRoom: "elder-101",
      directorPlanTimelineOpen: false,
      directorPlanTimelineSettled: false,
      selectedDirectorCareRecordElderId: directorCareRecordDraft.elderId,
      directorCareRecordDraft,
      directorCareRecordPreviewOpen: false,
      directorCareRecordBatchDate: "",
      selectedCaregiverReportElderId: "",
      caregiverDailyReportDraft: null,
      pendingCareRecordAction: "",
      directorAssignmentFilter: "unassigned",
      directorTemplateFilter: "all",
      directorTemplateSearch: "",
      directorResidentSearch: "",
      directorDispatchFilter: "pending",
      directorDispatchDraft: null,
      selectedDirectorStatisticsCaregiverId: "",
      directorAuditFloor: "all",
      directorAuditDate: director.date,
      directorAuditProject: "all",
      directorInboxSelectedDate: "",
      directorInboxExportDate: "",
      directorTemplateDraft: null,
      directorReportTemplateDraft: null,
      directorReportTemplateTransient: {
        newSectionTitle: "",
        newItems: {},
      },
      directorReportTemplatePreviewOpen: false,
      directorReportTemplatePreviewZoom: 1,
      directorReportTemplateScheduleSectionId: "",
      directorReportTemplateImportOpen: false,
      directorReportTemplateImportInstitutionId: "demo-qinghe-care",
      directorReportTemplateImportTemplateId: "",
      directorReportTemplateImportLoading: false,
      directorReportTemplateImportError: "",
      directorReportTemplateImportCatalog: {
        institutions: [],
        items: [],
      },
      directorPlanDraft: null,
      directorPlanItemDraft: null,
      directorPersonnelType: "caregiver",
      directorPersonnelFloor: 1,
      directorPersonnelDraft: null,
      directorPersonnelPlanDetailElderId: "",
      batchPanelOpen: false,
      batchExceptionPrompt: null,
      attendanceVerification: {
        status: "idle",
        fingerprintStatus: "idle",
        locationStatus: "idle",
        errorStage: "",
        errorMessage: "",
        locationLabel: "",
        locationAccuracy: "",
      },
      taskRecordEvidence: {},
      taskExceptionEvidence: {},
      quickExceptionEvidence: {},
      taskRecordNotes: {},
      taskExceptionNotes: {},
      quickExceptionNotes: {},
      taskRecordDialog: null,
      taskExceptionSaved: {},
      quickExceptionSaved: {},
      caregiverTimelineFullscreen: false,
      historyFilter: {
        time: "今日",
        status: "全部",
        search: "",
      },
      toast: "",
    },
    cloud: {
      careReports: seededCareReports,
      careReportsLoading: false,
      careReportsError: "",
      careReportsFetchedAt: "2026-04-22 16:10",
      tasks: [],
      caregiverReminders: [],
      tasksLoading: false,
      tasksError: "",
      tasksFetchedAt: "",
    },
    elders,
    tasks,
    batchJobs,
    vitals,
    dailyReports: seededCareReports,
    anomalies,
    messages,
    history,
  };
}
