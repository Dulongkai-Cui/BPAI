import { Pool } from "pg";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bpai:bpai@localhost:5433/bpai_dev";

const pool = new Pool({
  connectionString: databaseUrl,
});

const users = {
  owner: "user-first-local",
  design: "user-design-local",
  engineering: "user-engineering-local",
  admin: "user-admin-local",
};

function now(offsetHours = 0) {
  return new Date(Date.now() + offsetHours * 60 * 60 * 1000).toISOString();
}

const workOrders = [
  {
    id: "wo-demo-001",
    workOrderNo: "WO-20260401-001",
    title: "核心机房空调系统扩容",
    businessType: "机房改造",
    sourceType: "email",
    sourceSummary: "客户通过邮箱追加核心机房扩容需求，希望本周完成施工排期。",
    projectName: "长沙高新园区机房改造",
    siteName: "高新园区核心机房",
    siteAddress: "长沙市岳麓区高新园区主楼 B1",
    stage: "field_construction",
    status: "in_progress",
    priority: "urgent",
    warningStatus: "warning",
    currentResponsibleTeam: "工程执行组",
    currentResponsibleUserId: users.engineering,
    createdByUserId: users.owner,
    nextAction: "现场完成冷通道封板并补齐施工照片",
    materialCompleteness: 72,
    missingItemCount: 2,
    blockingItemCount: 1,
    latestProgressSummary: "现场已进场，主设备上架完成，等待夜间断电窗口。",
    createdAt: now(-72),
    updatedAt: now(-2),
    archivedAt: null,
  },
  {
    id: "wo-demo-002",
    workOrderNo: "WO-20260401-002",
    title: "B区配电箱更换",
    businessType: "配电整改",
    sourceType: "wechat",
    sourceSummary: "微信临时故障上报，要求先干活后补材料。",
    projectName: "园区配电整改",
    siteName: "B区动力房",
    siteAddress: "长沙市开福区 B 区动力房",
    stage: "return_sheet",
    status: "waiting",
    priority: "high",
    warningStatus: "normal",
    currentResponsibleTeam: "送审中心",
    currentResponsibleUserId: users.design,
    createdByUserId: users.owner,
    nextAction: "整理回单并补齐更换前后照片",
    materialCompleteness: 88,
    missingItemCount: 1,
    blockingItemCount: 0,
    latestProgressSummary: "施工已完成，当前停留在回单整理阶段。",
    createdAt: now(-96),
    updatedAt: now(-5),
    archivedAt: null,
  },
  {
    id: "wo-demo-003",
    workOrderNo: "WO-20260401-003",
    title: "地铁 7 号线送审资料补录",
    businessType: "送审资料",
    sourceType: "email",
    sourceSummary: "设计院要求补齐送审资料和签章页。",
    projectName: "长沙地铁 7 号线",
    siteName: "A4 标段",
    siteAddress: "长沙地铁 7 号线 A4 标段",
    stage: "warning",
    status: "blocked",
    priority: "high",
    warningStatus: "critical",
    currentResponsibleTeam: "设计院联审组",
    currentResponsibleUserId: users.design,
    createdByUserId: users.owner,
    nextAction: "补齐签章页并重新提交联审",
    materialCompleteness: 43,
    missingItemCount: 3,
    blockingItemCount: 2,
    latestProgressSummary: "送审卡在缺失签章页和竣工说明两处，已触发红色预警。",
    createdAt: now(-120),
    updatedAt: now(-8),
    archivedAt: null,
  },
  {
    id: "wo-demo-004",
    workOrderNo: "WO-20260401-004",
    title: "FTTR 新建资源录入",
    businessType: "资源录入",
    sourceType: "manual",
    sourceSummary: "现场完工后资源还未系统录入，需要补齐录资源链路。",
    projectName: "FTTR 新建",
    siteName: "梅溪湖 12 栋",
    siteAddress: "长沙市岳麓区梅溪湖 12 栋",
    stage: "resource_entry",
    status: "in_progress",
    priority: "normal",
    warningStatus: "normal",
    currentResponsibleTeam: "资源录入组",
    currentResponsibleUserId: users.admin,
    createdByUserId: users.owner,
    nextAction: "补录端口资源并提交稽核",
    materialCompleteness: 79,
    missingItemCount: 1,
    blockingItemCount: 0,
    latestProgressSummary: "端口资源已录入一半，等待现场铭牌照片。",
    createdAt: now(-60),
    updatedAt: now(-3),
    archivedAt: null,
  },
  {
    id: "wo-demo-005",
    workOrderNo: "WO-20260401-005",
    title: "主干光缆割接回单整理",
    businessType: "割接回单",
    sourceType: "phone",
    sourceSummary: "电话口头通知先执行割接，后补工单材料。",
    projectName: "城南主干光缆割接",
    siteName: "主干 3 号节点",
    siteAddress: "长沙市雨花区主干 3 号节点",
    stage: "drawing_delivery",
    status: "in_progress",
    priority: "high",
    warningStatus: "warning",
    currentResponsibleTeam: "设计院",
    currentResponsibleUserId: users.design,
    createdByUserId: users.owner,
    nextAction: "提交竣工图纸并确认对审版本",
    materialCompleteness: 67,
    missingItemCount: 2,
    blockingItemCount: 1,
    latestProgressSummary: "割接已结束，回单整理完成，当前卡在图纸对审。",
    createdAt: now(-48),
    updatedAt: now(-4),
    archivedAt: null,
  },
  {
    id: "wo-demo-006",
    workOrderNo: "WO-20260401-006",
    title: "应急光缆抢修",
    businessType: "应急抢修",
    sourceType: "wechat",
    sourceSummary: "微信群故障告警，要求立即出队抢修。",
    projectName: "城北应急抢修",
    siteName: "雨污分流工地旁",
    siteAddress: "长沙市开福区抢修点临时工地",
    stage: "dispatch",
    status: "open",
    priority: "urgent",
    warningStatus: "critical",
    currentResponsibleTeam: "工程执行组",
    currentResponsibleUserId: users.engineering,
    createdByUserId: users.owner,
    nextAction: "立即派单并确认到场时间",
    materialCompleteness: 24,
    missingItemCount: 4,
    blockingItemCount: 2,
    latestProgressSummary: "来源已记录，但现场信息和图纸资料均不完整，需要先抢修。",
    createdAt: now(-10),
    updatedAt: now(-1),
    archivedAt: null,
  },
  {
    id: "wo-demo-007",
    workOrderNo: "WO-20260401-007",
    title: "园区配电柜验收归档",
    businessType: "验收归档",
    sourceType: "manual",
    sourceSummary: "项目进入归档阶段，需整理全部材料。",
    projectName: "园区配电柜整改",
    siteName: "A栋配电房",
    siteAddress: "长沙市天心区 A 栋配电房",
    stage: "design_package",
    status: "completed",
    priority: "normal",
    warningStatus: "resolved",
    currentResponsibleTeam: "会计部",
    currentResponsibleUserId: users.owner,
    createdByUserId: users.owner,
    nextAction: "转固并文本归档",
    materialCompleteness: 100,
    missingItemCount: 0,
    blockingItemCount: 0,
    latestProgressSummary: "资料齐全，等待最终财务确认后归档。",
    createdAt: now(-240),
    updatedAt: now(-12),
    archivedAt: now(-6),
  },
  {
    id: "wo-demo-008",
    workOrderNo: "WO-20260401-008",
    title: "机房巡检标准化补录",
    businessType: "标准化补录",
    sourceType: "other",
    sourceSummary: "历史工单材料不完整，需要按模板补齐。",
    projectName: "机房标准化",
    siteName: "芙蓉区 2 号机房",
    siteAddress: "长沙市芙蓉区 2 号机房",
    stage: "registration",
    status: "waiting",
    priority: "low",
    warningStatus: "normal",
    currentResponsibleTeam: "办公室",
    currentResponsibleUserId: users.owner,
    createdByUserId: users.owner,
    nextAction: "先补最小登记字段，再分派到工程队",
    materialCompleteness: 35,
    missingItemCount: 2,
    blockingItemCount: 0,
    latestProgressSummary: "这单专门用于模拟先干活后补材料的现实流程。",
    createdAt: now(-36),
    updatedAt: now(-7),
    archivedAt: null,
  },
];

const sourceIntakes = [
  ["si-demo-001", "wo-demo-001", "email", "客户甲", "ops@client.local", "扩容邮件已收到", "需要本周夜间施工", "长沙高新园区机房改造", "高新园区核心机房", "confirmed", users.owner],
  ["si-demo-002", "wo-demo-002", "wechat", "现场群", "wechat-group-1", "群内临时故障上报", "先更换后补回单", "园区配电整改", "B区动力房", "revised", users.owner],
  ["si-demo-003", "wo-demo-003", "email", "设计院", "design@bpai.local", "送审资料补件提醒", "要求补齐签章页", "长沙地铁 7 号线", "A4 标段", "confirmed", users.design],
  ["si-demo-004", "wo-demo-004", "manual", "系统补录", "manual", "现场已完工后补录", "补齐录资源链路", "FTTR 新建", "梅溪湖 12 栋", "pending", null],
  ["si-demo-005", "wo-demo-005", "phone", "调度电话", "hotline", "先割接后补单", "需要图纸对审", "城南主干光缆割接", "主干 3 号节点", "confirmed", users.owner],
  ["si-demo-006", "wo-demo-006", "wechat", "故障群", "wechat-alert", "光缆中断告警", "要求立即抢修", "城北应急抢修", "雨污分流工地旁", "pending", null],
  ["si-demo-007", "wo-demo-007", "manual", "项目经理", "manual", "项目进入收尾", "整理归档材料", "园区配电柜整改", "A栋配电房", "confirmed", users.owner],
  ["si-demo-008", "wo-demo-008", "other", "历史导入", "legacy", "历史工单资料稀疏", "按标准化模板补齐", "机房标准化", "芙蓉区 2 号机房", "pending", null],
];

const dispatchExecutions = [
  ["de-demo-001", "wo-demo-001", 1, users.owner, "工程执行组", users.engineering, "in_progress", "warning", "夜间断电窗口紧张", "冷通道封板等待材料", "已协调客户放行夜间窗口", "继续推进夜间施工"],
  ["de-demo-002", "wo-demo-002", 1, users.owner, "工程执行组", users.engineering, "completed", "normal", "", "配电箱更换已完成", "已转交送审中心", "整理回单"],
  ["de-demo-003", "wo-demo-003", 1, users.owner, "设计院联审组", users.design, "paused", "critical", "资料不全导致停滞", "签章页缺失", "等待项目经理补签", "补齐后重新送审"],
  ["de-demo-004", "wo-demo-005", 1, users.owner, "工程执行组", users.engineering, "completed", "normal", "", "割接完成", "已转设计院做竣工图", "跟进图纸交付"],
  ["de-demo-005", "wo-demo-006", 1, users.owner, "工程执行组", users.engineering, "assigned", "critical", "未确认到场时点", "现场基础资料不全", "调度正在催到场", "立即出队"],
];

const deliveryResources = [
  ["dr-demo-001", "wo-demo-002", 1, "in_progress", "回单初稿已形成", "pending", null, "pending", "", "pending", "等待补照片", users.design],
  ["dr-demo-002", "wo-demo-004", 1, "not_applicable", "", "not_applicable", null, "in_progress", "等待现场铭牌照片后提交稽核", "pending", "录资源阶段进行中", users.admin],
  ["dr-demo-003", "wo-demo-005", 1, "completed", "回单整理完成", "in_progress", [{ name: "竣工图-V1.dwg" }], "not_applicable", "", "pending", "等待图纸对审", users.design],
  ["dr-demo-004", "wo-demo-007", 1, "completed", "回单完成", "completed", [{ name: "竣工图归档包.zip" }], "completed", "稽核通过", "completed", "资料齐全，等待财务确认", users.owner],
];

const missingItems = [
  ["mi-demo-001", "wo-demo-001", "field_construction", "photo", "施工照片", true, users.engineering, "open", "建议补拍主设备接线照片"],
  ["mi-demo-002", "wo-demo-001", "field_construction", "drawing", "断电窗口确认单", false, users.owner, "in_progress", "可先由调度补录窗口确认截图"],
  ["mi-demo-003", "wo-demo-002", "return_sheet", "photo", "更换后照片", false, users.engineering, "open", "建议从现场微信群抓取补录"],
  ["mi-demo-004", "wo-demo-003", "warning", "signature", "签章页", true, users.design, "open", "AI 已识别缺失签章页位置"],
  ["mi-demo-005", "wo-demo-003", "warning", "document", "竣工说明", true, users.owner, "open", "建议根据历史模板先生成草稿"],
  ["mi-demo-006", "wo-demo-003", "warning", "attachment", "联审盖章回执", false, users.design, "in_progress", "等待联审中心补回执"],
  ["mi-demo-007", "wo-demo-004", "resource_entry", "photo", "铭牌照片", false, users.admin, "open", "建议让现场补拍后上传合作空间"],
  ["mi-demo-008", "wo-demo-005", "drawing_delivery", "drawing", "对审版图纸", true, users.design, "open", "建议先挂一个待对审版本"],
  ["mi-demo-009", "wo-demo-005", "drawing_delivery", "record", "割接窗口记录", false, users.owner, "in_progress", "调度补录窗口时间即可"],
  ["mi-demo-010", "wo-demo-006", "dispatch", "site_info", "现场位置说明", true, users.owner, "open", "建议根据微信群定位信息先补录"],
  ["mi-demo-011", "wo-demo-006", "dispatch", "drawing", "抢修简图", true, users.design, "open", "AI 可先生成临时示意图草稿"],
  ["mi-demo-012", "wo-demo-006", "dispatch", "contact", "现场联系人", false, users.owner, "open", "调度可先电话确认后回填"],
  ["mi-demo-013", "wo-demo-006", "dispatch", "photo", "故障现场照片", false, users.engineering, "open", "待到场后上传"],
  ["mi-demo-014", "wo-demo-008", "registration", "project", "项目归属", false, users.owner, "open", "可由办公室先补最小登记信息"],
  ["mi-demo-015", "wo-demo-008", "registration", "site", "站点信息", false, users.owner, "in_progress", "建议先补站点名称与地址"],
];

const documentLinks = [
  ["wol-demo-001", "wo-demo-001", "construction_evidence", "external_ref", "demo://wo-demo-001/photos", "现场施工照片包", users.engineering],
  ["wol-demo-002", "wo-demo-003", "source_attachment", "external_ref", "demo://wo-demo-003/email-attachments", "送审补件邮件", users.design],
  ["wol-demo-003", "wo-demo-005", "drawing", "external_ref", "demo://wo-demo-005/drawing-v1", "竣工图初版", users.design],
  ["wol-demo-004", "wo-demo-007", "design_package", "external_ref", "demo://wo-demo-007/archive-package", "归档打包材料", users.owner],
];

async function main() {
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (const row of workOrders) {
      await client.query(
        `
        insert into work_orders (
          id, work_order_no, title, business_type, source_type, source_summary,
          project_name, site_name, site_address, stage, status, priority,
          warning_status, current_responsible_team, current_responsible_user_id,
          created_by_user_id, next_action, material_completeness,
          missing_item_count, blocking_item_count, latest_progress_summary,
          archived_at, created_at, updated_at
        )
        values (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,$11,$12,
          $13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24
        )
        on conflict (id) do update set
          work_order_no = excluded.work_order_no,
          title = excluded.title,
          business_type = excluded.business_type,
          source_type = excluded.source_type,
          source_summary = excluded.source_summary,
          project_name = excluded.project_name,
          site_name = excluded.site_name,
          site_address = excluded.site_address,
          stage = excluded.stage,
          status = excluded.status,
          priority = excluded.priority,
          warning_status = excluded.warning_status,
          current_responsible_team = excluded.current_responsible_team,
          current_responsible_user_id = excluded.current_responsible_user_id,
          created_by_user_id = excluded.created_by_user_id,
          next_action = excluded.next_action,
          material_completeness = excluded.material_completeness,
          missing_item_count = excluded.missing_item_count,
          blocking_item_count = excluded.blocking_item_count,
          latest_progress_summary = excluded.latest_progress_summary,
          archived_at = excluded.archived_at,
          updated_at = excluded.updated_at
        `,
        [
          row.id,
          row.workOrderNo,
          row.title,
          row.businessType,
          row.sourceType,
          row.sourceSummary,
          row.projectName,
          row.siteName,
          row.siteAddress,
          row.stage,
          row.status,
          row.priority,
          row.warningStatus,
          row.currentResponsibleTeam,
          row.currentResponsibleUserId,
          row.createdByUserId,
          row.nextAction,
          row.materialCompleteness,
          row.missingItemCount,
          row.blockingItemCount,
          row.latestProgressSummary,
          row.archivedAt,
          row.createdAt,
          row.updatedAt,
        ],
      );
    }

    for (const row of sourceIntakes) {
      await client.query(
        `
        insert into source_intakes (
          id, work_order_id, source_channel, initiator_name, source_account,
          original_message_summary, requirement_summary, extracted_project_name,
          extracted_site_name, confirmation_status, confirmed_by_user_id,
          created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (id) do update set
          original_message_summary = excluded.original_message_summary,
          requirement_summary = excluded.requirement_summary,
          confirmation_status = excluded.confirmation_status,
          confirmed_by_user_id = excluded.confirmed_by_user_id,
          updated_at = excluded.updated_at
        `,
        [...row, now(-2), now(-2)],
      );
    }

    for (const row of dispatchExecutions) {
      await client.query(
        `
        insert into dispatch_executions (
          id, work_order_id, dispatch_round, dispatched_by_user_id,
          assigned_team_label, assigned_user_id, execution_status,
          warning_status, warning_reason, anomaly_summary,
          coordination_record, next_action, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (id) do update set
          assigned_team_label = excluded.assigned_team_label,
          assigned_user_id = excluded.assigned_user_id,
          execution_status = excluded.execution_status,
          warning_status = excluded.warning_status,
          warning_reason = excluded.warning_reason,
          anomaly_summary = excluded.anomaly_summary,
          coordination_record = excluded.coordination_record,
          next_action = excluded.next_action,
          updated_at = excluded.updated_at
        `,
        [...row, now(-3), now(-1)],
      );
    }

    for (const row of deliveryResources) {
      const drawingDeliveryList = row[6] === null ? null : JSON.stringify(row[6]);
      await client.query(
        `
        insert into delivery_resources (
          id, work_order_id, delivery_round, return_sheet_status,
          return_sheet_summary, drawing_delivery_status, drawing_delivery_list,
          resource_entry_status, resource_audit_conclusion, design_package_status,
          final_delivery_note, submitted_by_user_id, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        on conflict (id) do update set
          return_sheet_status = excluded.return_sheet_status,
          return_sheet_summary = excluded.return_sheet_summary,
          drawing_delivery_status = excluded.drawing_delivery_status,
          drawing_delivery_list = excluded.drawing_delivery_list,
          resource_entry_status = excluded.resource_entry_status,
          resource_audit_conclusion = excluded.resource_audit_conclusion,
          design_package_status = excluded.design_package_status,
          final_delivery_note = excluded.final_delivery_note,
          submitted_by_user_id = excluded.submitted_by_user_id,
          updated_at = excluded.updated_at
        `,
        [
          row[0],
          row[1],
          row[2],
          row[3],
          row[4],
          row[5],
          drawingDeliveryList,
          row[7],
          row[8],
          row[9],
          row[10],
          row[11],
          now(-2),
          now(-1),
        ],
      );
    }

    for (const row of missingItems) {
      await client.query(
        `
        insert into missing_items (
          id, work_order_id, stage, item_type, material_label, is_blocking,
          owner_user_id, status, ai_suggested_content, created_by_user_id,
          updated_by_user_id, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (id) do update set
          status = excluded.status,
          ai_suggested_content = excluded.ai_suggested_content,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = excluded.updated_at
        `,
        [...row, users.owner, users.owner, now(-2), now(-1)],
      );
    }

    for (const row of documentLinks) {
      await client.query(
        `
        insert into work_order_document_links (
          id, work_order_id, link_type, target_type, target_id,
          relation_note, linked_by_user_id, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (id) do update set
          relation_note = excluded.relation_note,
          linked_by_user_id = excluded.linked_by_user_id,
          updated_at = excluded.updated_at
        `,
        [...row, now(-1), now(-1)],
      );
    }

    await client.query("commit");

    const countResult = await client.query(
      "select count(*)::int as count from work_orders",
    );
    console.log(
      JSON.stringify(
        {
          seededDemoWorkOrders: workOrders.length,
          totalWorkOrders: countResult.rows[0]?.count ?? 0,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
