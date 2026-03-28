import { formatDate } from "../core/utils.js";

/**
 * Document shape:
 * { id: string, name: string, category: string, uploadedAt: string, verificationStatus: string }
 */
function renderDocuments(items = [], targetSelector = "[data-documents]") {
  const target = document.querySelector(targetSelector);
  if (!target) return;

  if (!items.length) {
    target.innerHTML = "<div class='lhai-state lhai-state--empty'>No documents uploaded.</div>";
    return;
  }

  target.innerHTML = `
    <table class="lhai-table">
      <thead>
        <tr><th>Document</th><th>Category</th><th>Uploaded</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${items
          .map(
            (doc) => `
          <tr>
            <td>${doc.name}</td>
            <td>${doc.category}</td>
            <td>${formatDate(doc.uploadedAt)}</td>
            <td>${doc.verificationStatus}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export { renderDocuments };
