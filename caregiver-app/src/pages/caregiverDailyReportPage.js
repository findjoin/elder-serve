function renderCareRecordCheckOption(name, label, checked) {
  return `
    <label class="director-check-chip director-check-chip--record">
      <input type="checkbox" name="${name}" ${checked ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function renderCareRecordRadioOption(name, value, label, selectedValue) {
  return `
    <label class="director-check-chip director-check-chip--record">
      <input type="radio" name="${name}" value="${value}" ${value === selectedValue ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function renderSummaryChip(label, value, tone = "success") {
  return `<span class="status-pill status-pill--${tone}">${label} ${value}</span>`;
}

function renderReportTemplateSection(section, record) {
  return `
    <section class="care-report-template-section">
      <div class="care-report-template-section__title">${section.title}</div>
      <div class="director-check-chip-row director-check-chip-row--record-grid">
        ${(section.items || [])
          .map(
            (item) => `
              <label class="director-check-chip director-check-chip--record">
                <input
                  type="checkbox"
                  name="reportItem_${item.id}"
                  data-report-template-item="${item.id}"
                  ${record.reportItems?.[item.id] ? "checked" : ""}
                />
                <span>
                  ${item.label}
                  ${item.timeWindow ? `<small>${item.timeWindow}</small>` : ""}
                </span>
              </label>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderReportTemplateFields(record) {
  const template = record.reportTemplateSnapshot || {};
  const sections = template.sections || [];

  if (!sections.length) {
    return `<div class="empty-state empty-state--soft">当前没有可填写的日报项目。</div>`;
  }

  return `
    <div class="care-report-template-groups">
      ${sections.map((section) => renderReportTemplateSection(section, record)).join("")}
    </div>
  `;
}

export function renderCaregiverDailyReportPage({ selectors }) {
  const record = selectors.caregiverDailyReportDraft;
  const elder = selectors.selectedCaregiverReportElder;
  const summary = selectors.caregiverDailyReportSummary;
  const syncState = selectors.caregiverDailyReportStatus;

  if (!record || !elder || !summary || !syncState) {
    return `<section class="empty-state">未找到这位老人的交班日报。</section>`;
  }

  return `
    <section class="subpage-header">
      <div class="subpage-header__main">
        <h1>交班日报（提交）</h1>
      </div>
      <span class="status-pill status-pill--${syncState.tone}">${syncState.text}</span>
    </section>

    <section class="detail-stack care-report-page">
      <article class="care-report-notice">
        用于每日归档与交接，提交后同步云端并生成监管归档表（A4）。
      </article>

      <article class="detail-card care-report-card">
        <div class="detail-card__row">
          <strong>${elder.room}\u5ba4 \u00b7 ${elder.name}</strong>
          <small>${record.recordDate}</small>
        </div>
        <div class="detail-card__row detail-card__row--muted">
          <span>${elder.level} \u00b7 ${elder.bed}</span>
          <span>${record.caregiverName || ""}</span>
        </div>
        <div class="director-care-record-summary-row">
          ${renderSummaryChip("\u65e5\u5e38", summary.dailyCount, "success")}
          ${renderSummaryChip("\u670d\u836f", summary.medicationCount, "warning")}
          ${renderSummaryChip("\u5f02\u5e38", summary.issueCount, summary.issueCount ? "error" : "success")}
          ${renderSummaryChip("\u8865\u8d27", summary.refillCount, summary.refillCount ? "warning" : "success")}
        </div>
        <div class="care-report-syncbar care-report-syncbar--${syncState.tone}">
          ${syncState.detail}
        </div>
      </article>

      <form class="care-report-form" data-care-record-form>
        <article class="detail-card care-report-card">
          <div class="detail-card__row">
            <strong>\u57fa\u672c\u4fe1\u606f</strong>
            <small>\u8001\u4eba\u4fe1\u606f\u81ea\u52a8\u5e26\u51fa</small>
          </div>

          <div class="director-form-grid">
            <label class="director-field">
              <span>\u517b\u8001\u9662\u540d\u79f0</span>
              <input name="institutionName" type="text" value="${record.institutionName || ""}" />
            </label>
            <label class="director-field">
              <span>\u8001\u4eba\u59d3\u540d</span>
              <input name="elderName" type="text" value="${record.elderName || ""}" readonly />
            </label>
          </div>

          <div class="director-form-grid director-form-grid--compact">
            <label class="director-field">
              <span>\u6027\u522b</span>
              <input name="gender" type="text" value="${record.gender || ""}" readonly />
            </label>
            <label class="director-field">
              <span>\u5e74\u9f84</span>
              <input name="age" type="text" value="${record.age || ""}" readonly />
            </label>
            <label class="director-field">
              <span>\u623f\u95f4\u53f7</span>
              <input name="room" type="text" value="${record.room || ""}" readonly />
            </label>
          </div>

          <div class="director-form-grid director-form-grid--compact">
            <label class="director-field">
              <span>\u5e8a\u4f4d\u53f7</span>
              <input name="bed" type="text" value="${record.bed || ""}" readonly />
            </label>
            <label class="director-field">
              <span>\u8bb0\u5f55\u65e5\u671f</span>
              <input name="recordDate" type="date" value="${record.recordDate || ""}" />
            </label>
            <label class="director-field">
              <span>\u8bb0\u5f55\u65f6\u95f4</span>
              <input name="recordTime" type="time" value="${record.recordTime || ""}" />
            </label>
          </div>

          <label class="director-field director-field--full">
            <span>\u62a4\u7406\u7b49\u7ea7</span>
            <span class="director-check-chip-row director-check-chip-row--record">
              ${renderCareRecordRadioOption("careType", "self-care", "\u81ea\u7406", record.careType)}
              ${renderCareRecordRadioOption("careType", "semi-care", "\u534a\u81ea\u7406", record.careType)}
              ${renderCareRecordRadioOption("careType", "full-care", "\u5168\u62a4\u7406", record.careType)}
            </span>
          </label>

          <div class="director-form-grid">
            <label class="director-field">
              <span>\u62a4\u7406\u5458</span>
              <input name="caregiverName" type="text" value="${record.caregiverName || ""}" />
            </label>
            <label class="director-field">
              <span>\u5ba1\u6838\u4eba</span>
              <input
                name="reviewerName"
                type="text"
                value="${record.reviewerName || ""}"
                placeholder="\u53ef\u7559\u7ed9\u9662\u957f\u540e\u7eed\u5ba1\u6838"
              />
            </label>
          </div>

          <input type="hidden" name="elderId" value="${record.elderId || ""}" />
        </article>

        <article class="detail-card care-report-card">
          <div class="detail-card__row">
            <strong>日报项目</strong>
            <small>${record.reportTemplateSnapshot?.title || "护理记录日报模板"}</small>
          </div>
          ${renderReportTemplateFields(record)}
        </article>

        <article class="detail-card care-report-card">
          <div class="detail-card__row">
            <strong>\u670d\u836f\u8bb0\u5f55</strong>
            <small>\u6309\u65f6\u6bb5\u5feb\u901f\u52fe\u9009</small>
          </div>

          <div class="director-check-chip-row director-check-chip-row--record">
            ${renderCareRecordCheckOption("medicationMorning", "\u4e0a\u5348\u670d\u836f", record.medication?.morning)}
            ${renderCareRecordCheckOption("medicationAfternoon", "\u4e0b\u5348\u670d\u836f", record.medication?.afternoon)}
            ${renderCareRecordCheckOption("medicationEvening", "\u665a\u4e0a\u670d\u836f", record.medication?.evening)}
          </div>

          <label class="director-field director-field--full">
            <span>\u7279\u6b8a\u7528\u836f</span>
            <span class="director-check-chip-row director-check-chip-row--record">
              ${renderCareRecordRadioOption("specialMedicationStatus", "taken", "\u5df2\u670d", record.medication?.specialStatus)}
              ${renderCareRecordRadioOption("specialMedicationStatus", "none", "\u65e0", record.medication?.specialStatus)}
            </span>
          </label>

          <label class="director-field director-field--full">
            <span>\u5e38\u7528\u836f\u7269</span>
            <input
              name="commonDrugs"
              type="text"
              value="${record.medication?.commonDrugs || ""}"
              placeholder="\u4f8b\u5982\uff1a\u964d\u538b\u836f\u3001\u7ef4\u751f\u7d20 D"
            />
          </label>
        </article>

        <article class="detail-card care-report-card">
          <div class="detail-card__row">
            <strong>\u5065\u5eb7\u72b6\u51b5\u4e0e\u5f02\u5e38</strong>
            <small>\u5f02\u5e38\u5c3d\u91cf\u7b80\u77ed\uff0c\u8be6\u7ec6\u5199\u5728\u5904\u7406\u60c5\u51b5</small>
          </div>

          <div class="director-check-chip-row director-check-chip-row--record-grid">
            ${renderCareRecordCheckOption("healthNone", "\u65e0\u5f02\u5e38", record.health?.none)}
            ${renderCareRecordCheckOption("healthAppetitePoor", "\u98df\u6b32\u5dee", record.health?.appetitePoor)}
            ${renderCareRecordCheckOption("healthSleepPoor", "\u7761\u7720\u4e0d\u4f73", record.health?.sleepPoor)}
            ${renderCareRecordCheckOption("healthDizziness", "\u5934\u6655 / \u5934\u75db", record.health?.dizziness)}
            ${renderCareRecordCheckOption("healthNausea", "\u6076\u5fc3 / \u5455\u5410", record.health?.nausea)}
            ${renderCareRecordCheckOption("healthBowelIssue", "\u8179\u6cfb / \u4fbf\u79d8", record.health?.bowelIssue)}
            ${renderCareRecordCheckOption("healthSkinIssue", "\u76ae\u80a4\u5f02\u5e38", record.health?.skinIssue)}
            ${renderCareRecordCheckOption("healthFall", "\u6454\u5012 / \u78d5\u78b0", record.health?.fall)}
          </div>

          <label class="director-field director-field--full">
            <span>\u5176\u4ed6\u5f02\u5e38</span>
            <input
              name="healthOther"
              type="text"
              value="${record.health?.other || ""}"
              placeholder="\u4f8b\u5982\uff1a\u5348\u540e\u8f7b\u5fae\u5934\u6655"
            />
          </label>

          <label class="director-field director-field--full">
            <span>\u5904\u7406\u60c5\u51b5</span>
            <textarea
              name="healthTreatment"
              rows="3"
              placeholder="\u4f8b\u5982\uff1a\u5df2\u5367\u5e8a\u4f11\u606f\uff0c\u901a\u77e5\u503c\u73ed\u62a4\u58eb\u590d\u6d4b\u8840\u538b\u3002"
            >${record.health?.treatment || ""}</textarea>
          </label>
        </article>

        <article class="detail-card care-report-card">
          <div class="detail-card__row">
            <strong>\u7269\u54c1\u5e93\u5b58\u63d0\u9192</strong>
            <small>\u53ea\u6807\u6ce8\u662f\u5426\u9700\u8981\u8865\u5145</small>
          </div>

          <div class="director-care-record-status-list">
            <div class="director-care-record-status-row">
              <strong>\u836f\u54c1</strong>
              <div class="director-check-chip-row director-check-chip-row--record">
                ${renderCareRecordRadioOption("inventoryMedicine", "enough", "\u5145\u8db3", record.inventory?.medicine)}
                ${renderCareRecordRadioOption("inventoryMedicine", "refill", "\u9700\u8865\u5145", record.inventory?.medicine)}
              </div>
            </div>
            <div class="director-care-record-status-row">
              <strong>\u5c3f\u4e0d\u6e7f</strong>
              <div class="director-check-chip-row director-check-chip-row--record">
                ${renderCareRecordRadioOption("inventoryDiaper", "enough", "\u5145\u8db3", record.inventory?.diaper)}
                ${renderCareRecordRadioOption("inventoryDiaper", "refill", "\u9700\u8865\u5145", record.inventory?.diaper)}
              </div>
            </div>
            <div class="director-care-record-status-row">
              <strong>\u62a4\u57ab</strong>
              <div class="director-check-chip-row director-check-chip-row--record">
                ${renderCareRecordRadioOption("inventoryPad", "enough", "\u5145\u8db3", record.inventory?.pad)}
                ${renderCareRecordRadioOption("inventoryPad", "refill", "\u9700\u8865\u5145", record.inventory?.pad)}
              </div>
            </div>
            <div class="director-care-record-status-row">
              <strong>\u751f\u6d3b\u7528\u54c1</strong>
              <div class="director-check-chip-row director-check-chip-row--record">
                ${renderCareRecordRadioOption("inventorySupplies", "enough", "\u5145\u8db3", record.inventory?.supplies)}
                ${renderCareRecordRadioOption("inventorySupplies", "refill", "\u9700\u8865\u5145", record.inventory?.supplies)}
              </div>
            </div>
          </div>
        </article>

        <article class="detail-card care-report-card">
          <div class="detail-card__row">
            <strong>\u7b7e\u5b57\u786e\u8ba4</strong>
            <small>\u5148\u5f55\u5165\uff0c\u540e\u7eed\u53ef\u63a5\u4e91\u7aef\u548c\u5ba1\u6838\u6d41</small>
          </div>

          <div class="director-form-grid">
            <label class="director-field">
              <span>\u62a4\u7406\u5458\u7b7e\u540d</span>
              <input
                name="caregiverSign"
                type="text"
                value="${record.signatures?.caregiverSign || ""}"
                placeholder="\u5148\u586b\u59d3\u540d\u6216\u7559\u7a7a"
              />
            </label>
            <label class="director-field">
              <span>\u5ba1\u6838\u4eba\u7b7e\u540d</span>
              <input
                name="reviewerSign"
                type="text"
                value="${record.signatures?.reviewerSign || ""}"
                placeholder="\u53ef\u540e\u7eed\u8865\u7b7e"
              />
            </label>
          </div>

          <label class="director-field director-field--full">
            <span>\u5907\u6ce8</span>
            <textarea
              name="remark"
              rows="3"
              placeholder="\u586b\u5199\u4ea4\u63a5\u63d0\u9192\u3001\u672a\u5b8c\u6210\u4e8b\u9879\u6216\u8865\u5145\u8bf4\u660e\u3002"
            >${record.signatures?.remark || ""}</textarea>
          </label>
        </article>
      </form>

      <article class="detail-card care-report-card care-report-card--hint">
        <div class="detail-card__row">
          <strong>云端同步已接入</strong>
          <small>草稿留在本地，提交时上传到云端日报收件箱</small>
        </div>
        <p class="director-copy">提交后会先写入云服务器，院长端的“日报收件箱（云端）”会自动刷新看到新交班日报，再生成监管归档表（A4）。</p>
      </article>

      <div class="care-report-actions">
        <button class="button button--secondary button--block" data-action="save-daily-report">保存草稿</button>
        <button class="button button--primary button--block" data-action="submit-daily-report">提交交班日报</button>
      </div>
    </section>
  `;
}
