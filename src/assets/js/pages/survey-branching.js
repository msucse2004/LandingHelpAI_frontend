import { surveyCustomerApi } from "../core/api.js";
import { qs, safeText, scrollPageToTop } from "../core/utils.js";

const NEED_CARDS = [
  {
    value: "arrival_setup",
    title: "미국 입국 준비가 필요해요",
  },
  { value: "housing", title: "집 구하기가 필요해요" },
  { value: "mobility", title: "자동차가 필요해요" },
  { value: "family_school", title: "아이 학교 등록이 필요해요" },
  { value: "admin_business", title: "생활 행정/LLC 설립이 필요해요" },
];

const SECTION_TITLES = {
  arrival_setup: "미국 입국/초기 설정",
  housing: "집 구하기",
  mobility: "자동차/이동",
  family_school: "가족/학교 등록",
  admin_business: "생활 행정/비즈니스",
};

const STORAGE_KEY = "lhai_survey_branching_state";

let questionnaireVersionId = "";
let items = [];
let needItem = null;

let selectedNeedValues = [];
let answersByItemId = {};

let visibleQuestions = [];
let stepIndex = 0; // 0 = needs, 1.. = questions, > visibleQuestions.length = done

let submissionId = "";
let customerId = "profile::demo@customer.com";

let optionsByItemId = {};

function setStatus(message) {
  qs("#surveyBranchingStatus") && (qs("#surveyBranchingStatus").textContent = message || "");
}

function parseQueryNeeds() {
  const q = new URLSearchParams(window.location.search);
  const needsRaw = (q.get("needs") || "").trim();
  if (!needsRaw) return [];
  return needsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCustomerId() {
  const q = new URLSearchParams(window.location.search);
  return (q.get("customer_profile_id") || q.get("customer") || "profile::demo@customer.com").trim();
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function setProgress(activeStepNumber, totalSteps) {
  const fill = qs("#surveyBranchingProgressFill");
  const label = qs("#surveyBranchingProgressLabel");
  if (fill) fill.style.width = `${Math.round((activeStepNumber / totalSteps) * 100)}%`;
  if (label) label.textContent = `${activeStepNumber}/${totalSteps} 단계`;
}

function isNeedsIncludesConditional(item, selectedNeeds) {
  const cond = item?.conditional_rule_json;
  if (!cond || typeof cond !== "object") return true;
  if (Object.keys(cond).length === 0) return true;
  if (cond.type === "needs_includes") {
    const ov = String(cond.option_value || "").trim();
    return selectedNeeds.includes(ov);
  }
  // unknown condition types are treated as visible to avoid hiding everything.
  return true;
}

function recomputeVisibleQuestions() {
  const selected = selectedNeedValues;
  const followups = items
    .filter((it) => needItem && it.id !== needItem.id)
    .filter((it) => isNeedsIncludesConditional(it, selected))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  visibleQuestions = followups;
}

function currentTotalSteps() {
  // Needs step (1) + visible question count + final review step (1).
  return 2 + visibleQuestions.length;
}

function showNeedsStep() {
  qs("#surveyStepNeeds").hidden = false;
  qs("#surveyStepQuestion").hidden = true;
  qs("#surveyStepReview").hidden = true;
  scrollPageToTop();
}

function showQuestionStep() {
  qs("#surveyStepNeeds").hidden = true;
  qs("#surveyStepQuestion").hidden = false;
  qs("#surveyStepReview").hidden = true;
}

function showReviewStep() {
  qs("#surveyStepNeeds").hidden = true;
  qs("#surveyStepQuestion").hidden = true;
  qs("#surveyStepReview").hidden = false;

  const block = qs("#surveyBranchingReviewBlock");
  if (block) {
    const groups = {};
    visibleQuestions.forEach((q) => {
      const ans = answersByItemId[q.id]?.value ?? answersByItemId[q.id]?.values ?? answersByItemId[q.id] ?? null;
      const key = q.section_code || "section";
      groups[key] = groups[key] || [];
      if (answersByItemId[q.id]) groups[key].push(`${q.question_code}: ${JSON.stringify(answersByItemId[q.id])}`);
    });
    const needText = selectedNeedValues.join(", ");
    const summaryLines = Object.entries(groups)
      .map(([k, v]) => `<div style="margin-top:8px;"><div style="font-weight:900; color: var(--lhai-color-accent);">${safeText(k)}</div><div class="lhai-help">${safeText(v.join(", "))}</div></div>`)
      .join("");
    block.innerHTML = `
      <div style="font-weight: 900; margin-bottom: 8px;">선택 영역: ${safeText(needText || "-")}</div>
      <div class="lhai-help">아래 답변을 기반으로 추천 패키지/모듈/애드온이 계산됩니다.</div>
      ${summaryLines}
    `;
  }
  scrollPageToTop();
}

function setNeedCardsPressed() {
  const cards = document.querySelectorAll(".survey-branching__need-card");
  cards.forEach((card) => {
    const v = card.getAttribute("data-need") || "";
    const pressed = selectedNeedValues.includes(v);
    card.setAttribute("aria-pressed", pressed ? "true" : "false");
  });

  if (qs("#surveyBranchingNeedsStatus")) {
    qs("#surveyBranchingNeedsStatus").textContent = `선택한 영역: ${selectedNeedValues.length}개`;
  }
}

function getNeedValuesFromCards() {
  const cards = document.querySelectorAll(".survey-branching__need-card");
  const selected = [];
  cards.forEach((card) => {
    const pressed = card.getAttribute("aria-pressed") === "true";
    if (!pressed) return;
    const v = card.getAttribute("data-need");
    if (v) selected.push(v);
  });
  return uniq(selected);
}

function renderInputForItem(item, currentValue) {
  const wrap = qs("#surveyBranchingInputWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const inputType = item.input_type || "text";

  if (inputType === "number") {
    const n = currentValue?.value ?? "";
    const valueAttr = n === "" || n == null ? "" : String(n);
    wrap.innerHTML = `
      <label class="lhai-label" for="surveyBranchingNumberInput">${safeText(item.label)}</label>
      <input class="lhai-input" id="surveyBranchingNumberInput" type="number" min="0" step="1" value="${valueAttr}" placeholder="${safeText(item.placeholder || "")}" />
    `;
  } else if (inputType === "text") {
    const t = currentValue?.value ?? "";
    const valueAttr = t === "" || t == null ? "" : String(t);
    wrap.innerHTML = `
      <label class="lhai-label" for="surveyBranchingTextInput">${safeText(item.label)}</label>
      <input class="lhai-input" id="surveyBranchingTextInput" type="text" value="${valueAttr}" placeholder="${safeText(item.placeholder || "")}" />
    `;
  } else if (inputType === "select") {
    const selectId = "surveyBranchingSelectInput";
    const options = optionsByItemId[item.id] || [];
    const selectedValue = currentValue?.value ?? "";

    wrap.innerHTML = `
      <label class="lhai-label" for="${selectId}">${safeText(item.label)}</label>
      <select class="lhai-select" id="${selectId}">
        <option value="" ${!selectedValue ? "selected" : ""}>선택</option>
        ${options
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((o) => `<option value="${safeText(o.value)}" ${String(o.value) === String(selectedValue) ? "selected" : ""}>${safeText(o.label)}</option>`)
          .join("")}
      </select>
    `;
  } else if (inputType === "multi_select") {
    const options = optionsByItemId[item.id] || [];
    const selectedValues = Array.isArray(currentValue?.values) ? currentValue.values : [];
    wrap.innerHTML = `
      <div class="survey-branching__needs-grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); margin-top: 0;">
        ${options
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((o) => {
            const checked = selectedValues.includes(o.value);
            return `
              <button type="button" class="survey-branching__need-card" data-value="${safeText(o.value)}" aria-pressed="${checked ? "true" : "false"}">
                <div class="survey-branching__need-card-title" style="font-weight:900;">${safeText(o.label)}</div>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
    const cardEls = wrap.querySelectorAll("[data-value]");
    cardEls.forEach((el) => {
      el.addEventListener("click", () => {
        const v = el.getAttribute("data-value") || "";
        const pressed = el.getAttribute("aria-pressed") === "true";
        el.setAttribute("aria-pressed", pressed ? "false" : "true");
      });
    });
  } else {
    // fallback
    const t = currentValue?.value ?? "";
    wrap.innerHTML = `
      <label class="lhai-label" for="surveyBranchingTextInput">${safeText(item.label)}</label>
      <input class="lhai-input" id="surveyBranchingTextInput" type="text" value="${safeText(t)}" placeholder="${safeText(item.placeholder || "")}" />
    `;
  }
}

async function renderQuestionStep() {
  const qWrap = qs("#surveyStepQuestion");
  if (!qWrap) return;

  const q = visibleQuestions[stepIndex - 1];
  if (!q) return;

  qs("#surveyBranchingSectionTitle").textContent = SECTION_TITLES[q.section_code] || q.section_code || "-";
  qs("#surveyBranchingQuestionLabel").textContent = q.label || "-";
  qs("#surveyBranchingQuestionHelp").textContent = q.help_text || "";

  const existingAnswer = answersByItemId[q.id] || null;

  if (q.input_type === "select" || q.input_type === "multi_select") {
    if (!optionsByItemId[q.id]) {
      try {
        qs("#surveyBranchingInputWrap").innerHTML = `<div class="lhai-help">옵션을 불러오는 중...</div>`;
        optionsByItemId[q.id] = await surveyCustomerApi.listQuestionOptions(q.id);
      } catch (e) {
        // mock fallback should already work; keep a safe state.
        optionsByItemId[q.id] = optionsByItemId[q.id] || [];
      }
    }
  }

  renderInputForItem(q, existingAnswer);
  scrollPageToTop();
}

function getAnswerFromInput(item) {
  const inputType = item.input_type || "text";
  if (inputType === "number") {
    const v = qs("#surveyBranchingNumberInput")?.value;
    const num = v === "" || v == null ? null : Number(v);
    if (num == null || Number.isNaN(num)) return {};
    return { value: num };
  }
  if (inputType === "text") {
    const v = qs("#surveyBranchingTextInput")?.value;
    if (!v || !String(v).trim()) return {};
    return { value: String(v).trim() };
  }
  if (inputType === "select") {
    const v = qs("#surveyBranchingSelectInput")?.value;
    if (!v) return {};
    return { value: v };
  }
  if (inputType === "multi_select") {
    const selected = [];
    const btns = qs("#surveyBranchingInputWrap")?.querySelectorAll("[data-value]") || [];
    Array.from(btns).forEach((b) => {
      const pressed = b.getAttribute("aria-pressed") === "true";
      const v = b.getAttribute("data-value");
      if (pressed && v) selected.push(v);
    });
    if (!selected.length) return {};
    return { values: selected };
  }

  return {};
}

function updateNavButtons() {
  const backBtn = qs("#surveyBranchingBackBtn");
  const nextBtn = qs("#surveyBranchingNextBtn");
  if (!backBtn || !nextBtn) return;

  const totalSteps = currentTotalSteps();
  const isReview = stepIndex === visibleQuestions.length + 1;
  const isOutOfRange = stepIndex < 0 || stepIndex > visibleQuestions.length + 1;

  backBtn.disabled = stepIndex <= 0 || isOutOfRange;
  nextBtn.disabled = isOutOfRange;

  if (isReview) {
    nextBtn.textContent = "제출하고 추천 보기";
  } else {
    nextBtn.textContent = "다음";
  }

  setProgress(Math.min(stepIndex + 1, totalSteps), totalSteps);
}

async function saveNeedAreasIfNeeded() {
  if (!needItem) return;
  const answerJson = { values: selectedNeedValues };
  answersByItemId[needItem.id] = answerJson;

  if (submissionId) {
    await surveyCustomerApi.upsertAnswer(submissionId, {
      submission_id: submissionId,
      question_item_id: needItem.id,
      answer_json: answerJson,
    });
  }
}

function persistLocalState() {
  const payload = {
    versionId: questionnaireVersionId,
    submissionId,
    selectedNeedValues,
    answersByItemId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

async function loadLocalStateIfAny(versionId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.versionId !== versionId) return null;
    return state;
  } catch {
    return null;
  }
}

async function init() {
  customerId = parseCustomerId();
  const queryNeeds = parseQueryNeeds();

  setStatus("설문 구성을 불러오는 중...");
  const active = await surveyCustomerApi.getActiveQuestionnaireVersion();
  questionnaireVersionId = active?.version?.id || "";
  items = await surveyCustomerApi.listQuestionItems(questionnaireVersionId);

  needItem = items.find((it) => it.question_code === "need_areas") || null;

  // Load cached state first.
  const localState = await loadLocalStateIfAny(questionnaireVersionId);
  if (localState?.selectedNeedValues) selectedNeedValues = uniq(localState.selectedNeedValues);
  if (localState?.answersByItemId) answersByItemId = localState.answersByItemId;
  if (localState?.submissionId) submissionId = localState.submissionId;

  if (queryNeeds && queryNeeds.length) {
    selectedNeedValues = uniq(queryNeeds);
  }

  recomputeVisibleQuestions();
  setNeedCardsPressed();

  // Ensure we have submission and draft answers.
  if (!submissionId) {
    setStatus("설문을 시작하는 중...");
    const payload = {
      questionnaire_version_id: questionnaireVersionId,
      customer_id: customerId,
      status: "IN_PROGRESS",
      started_at: null,
      recommendation_snapshot_json: {},
    };
    const sub = await surveyCustomerApi.startSubmission(payload);
    submissionId = sub?.id || "";
  }

  // If we have submission id but no local cached answers, fetch them.
  if ((!localState || !localState.answersByItemId) && submissionId) {
    try {
      const ansList = await surveyCustomerApi.listSubmissionAnswers(submissionId);
      ansList.forEach((a) => {
        answersByItemId[a.question_item_id] = a.answer_json || {};
      });
    } catch {
      // ignore
    }
  }

  persistLocalState();

  // Decide initial step based on answered visible questions.
  const answered = new Set(Object.keys(answersByItemId || {}));
  const firstUnansweredIdx = visibleQuestions.findIndex((q) => !answered.has(q.id));
  if (firstUnansweredIdx === -1) stepIndex = visibleQuestions.length + 1;
  else if (answered.size) stepIndex = firstUnansweredIdx + 1;
  else stepIndex = 0;

  updateNavButtons();
  setStatus("");

  // Bind need cards
  const cards = document.querySelectorAll(".survey-branching__need-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const v = card.getAttribute("data-need") || "";
      const pressed = card.getAttribute("aria-pressed") === "true";
      if (pressed) {
        selectedNeedValues = selectedNeedValues.filter((x) => x !== v);
      } else {
        selectedNeedValues = uniq([...selectedNeedValues, v]);
      }
      setNeedCardsPressed();
      // While on needs step, recompute visible questions and progress immediately.
      if (stepIndex === 0) {
        recomputeVisibleQuestions();
      }
      persistLocalState();
      updateNavButtons();
    });
  });

  qs("#surveyBranchingBackBtn")?.addEventListener("click", async () => {
    setStatus("");
    stepIndex = Math.max(0, stepIndex - 1);
    persistLocalState();
    updateNavButtons();

    if (stepIndex === 0) {
      showNeedsStep();
      return;
    }
    if (stepIndex <= visibleQuestions.length) {
      showQuestionStep();
      await renderQuestionStep();
    } else {
      showReviewStep();
    }
  });

  qs("#surveyBranchingNextBtn")?.addEventListener("click", async () => {
    setStatus("");
    const isReview = stepIndex === visibleQuestions.length + 1;
    if (isReview) {
      // Submit -> redirect to recommendations page.
      if (!submissionId) {
        setStatus("제출할 세션이 없습니다. 다시 시작해 주세요.");
        return;
      }
      const backBtn = qs("#surveyBranchingBackBtn");
      const nextBtn = qs("#surveyBranchingNextBtn");
      if (backBtn) backBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      setStatus("제출 중... 추천을 계산하는 중입니다.");
      try {
        await surveyCustomerApi.completeSubmission(submissionId);
        window.location.href = `survey-recommendations.html?submission_id=${encodeURIComponent(submissionId)}`;
        return;
      } catch (err) {
        setStatus(`제출 실패: ${err?.message || err}`);
        if (backBtn) backBtn.disabled = false;
        if (nextBtn) nextBtn.disabled = false;
        return;
      }
    }

    // Needs step -> compute visible questions + save need areas
    if (stepIndex === 0) {
      selectedNeedValues = uniq(selectedNeedValues);
      if (!selectedNeedValues.length) {
        setStatus("필요 영역을 최소 1개 선택해주세요.");
        return;
      }
      recomputeVisibleQuestions();
      setNeedCardsPressed();
      // Save needs selection as the first answer.
      try {
        await saveNeedAreasIfNeeded();
      } catch (err) {
        setStatus(`Error: ${err?.message || err}`);
        return;
      }
      persistLocalState();
      stepIndex = visibleQuestions.length ? 1 : visibleQuestions.length + 1;
      updateNavButtons();
      if (stepIndex <= visibleQuestions.length) {
        showQuestionStep();
        await renderQuestionStep();
      } else {
        showReviewStep();
      }
      return;
    }

    // Question step
    const q = visibleQuestions[stepIndex - 1];
    if (!q) return;

    const answerJson = getAnswerFromInput(q);
    if (q.required && Object.keys(answerJson || {}).length === 0) {
      setStatus("필수 질문에 답해주세요.");
      return;
    }

    answersByItemId[q.id] = answerJson;
    persistLocalState();

    try {
      if (submissionId) {
        await surveyCustomerApi.upsertAnswer(submissionId, {
          submission_id: submissionId,
          question_item_id: q.id,
          answer_json: answerJson,
        });
      }
    } catch (err) {
      setStatus(`저장에 실패했습니다. ${err?.message || err}`);
      return;
    }

    setStatus("");
    stepIndex += 1;
    updateNavButtons();

    if (stepIndex <= visibleQuestions.length) {
      showQuestionStep();
      await renderQuestionStep();
      setStatus("");
    } else {
      showReviewStep();
      setStatus("");
    }
  });

  // Initial render
  if (stepIndex === 0) {
    showNeedsStep();
  } else if (stepIndex <= visibleQuestions.length) {
    showQuestionStep();
    await renderQuestionStep();
  } else {
    showReviewStep();
  }
}

init();

