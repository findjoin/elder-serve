import { renderIcon } from "../utils/caregiverUi.js";

export function renderInventoryUsagePage({ selectors }) {
  const draft = selectors.inventoryUsageDraft || {};
  const items = selectors.inventoryItems || [];

  return `
    <section class="subpage-header inventory-usage-header">
      <div class="subpage-header__main">
        <button class="icon-button" data-action="close-inventory-usage">${renderIcon("caretRight")}</button>
        <div>
          <h1>记录库存使用</h1>
          <p>提交后同步云端并扣减库存，不关联老人。</p>
        </div>
      </div>
    </section>

    <section class="detail-stack inventory-usage-page">
      <form class="inventory-form inventory-form--page" data-inventory-usage-form>
        <div class="inventory-form__grid">
          <label class="inventory-field inventory-field--full">
            消耗品
            <select name="itemId">
              ${items
                .map(
                  (item) => `
                    <option value="${item.id}" ${draft.itemId === item.id ? "selected" : ""}>
                      ${item.name}（剩余 ${item.quantity}${item.unit}）
                    </option>
                  `,
                )
                .join("")}
            </select>
          </label>
          <label class="inventory-field">
            使用数量
            <input name="quantity" type="number" min="1" value="${draft.quantity || 1}" />
          </label>
          <label class="inventory-field inventory-field--full">
            备注
            <input name="note" value="${draft.note || ""}" placeholder="如 更换护理垫" />
          </label>
        </div>
        <div class="inventory-form__actions">
          <button type="button" class="button button--secondary" data-action="close-inventory-usage">取消</button>
          <button type="button" class="button button--primary" data-action="submit-inventory-usage">提交使用记录</button>
        </div>
      </form>
    </section>
  `;
}
