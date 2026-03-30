import { qs } from "../core/utils.js";

const PROBLEMS = [
  { key: "immigration", title: "미국 입국 준비가 필요해요" },
  { key: "housing", title: "집 구하기가 필요해요" },
  { key: "car", title: "자동차가 필요해요" },
  { key: "school", title: "아이 학교 등록이 필요해요" },
  { key: "admin", title: "생활 행정 도움이 필요해요" },
  { key: "llc", title: "LLC 설립이 필요해요" },
];

function setStatus(message) {
  const el = qs("#surveyFormStatus");
  if (el) el.textContent = message || "";
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getSelectedProblems() {
  const cards = document.querySelectorAll(".survey-problem-card");
  return Array.from(cards)
    .filter((c) => c.getAttribute("aria-pressed") === "true")
    .map((c) => c.getAttribute("data-key"));
}

function renderProgress(visibleStep) {
  const steps = 7;
  const fill = qs("#surveyProgressFill");
  const label = qs("#surveyProgressLabel");
  const container = qs("#surveyProgressSteps");

  const activeStep = clamp(visibleStep, 1, steps);
  const pct = ((activeStep - 1) / (steps - 1)) * 100;
  if (fill) fill.style.width = `${pct}%`;
  if (label) label.textContent = `${activeStep}/${steps} 단계`;

  if (!container) return;
  if (container.children.length) return;

  container.innerHTML = Array.from({ length: steps }, (_, idx) => {
    const stepNo = idx + 1;
    const dotClass = stepNo < activeStep ? "is-done" : stepNo === activeStep ? "is-active" : "";
    return `
      <li>
        <div class="survey-progress__dot ${dotClass}" aria-hidden="true">${stepNo}</div>
        <span>${stepNo}</span>
      </li>
    `;
  }).join("");
}

function updateProgressDots(activeStep) {
  const container = qs("#surveyProgressSteps");
  if (!container) return;
  const dots = container.querySelectorAll(".survey-progress__dot");
  dots.forEach((dot) => {
    const stepNo = Number(dot.textContent || dot.getAttribute("data-step") || "0");
    dot.classList.remove("is-active", "is-done");
    if (stepNo < activeStep) dot.classList.add("is-done");
    if (stepNo === activeStep) dot.classList.add("is-active");
  });
}

function showStep(stepNo) {
  const totalSteps = 7;
  const stepIds = Array.from({ length: totalSteps + 1 }, (_, idx) => (idx === 0 ? "" : `#surveyStep${idx + 1}`));
  // We'll also have summary as step 8.
  const stepMap = {
    1: "#surveyStep1",
    2: "#surveyStep2",
    3: "#surveyStep3",
    4: "#surveyStep4",
    5: "#surveyStep5",
    6: "#surveyStep6",
    7: "#surveyStep7",
    8: "#surveyStep8",
  };

  for (const [_, selector] of Object.entries(stepMap)) {
    const el = qs(selector);
    if (el) el.hidden = true;
  }

  const activeSelector = stepMap[stepNo];
  const activeEl = qs(activeSelector);
  if (activeEl) activeEl.hidden = false;

  const backBtn = qs("#surveyBackBtn");
  const nextBtn = qs("#surveyNextBtn");
  if (backBtn) backBtn.disabled = stepNo <= 1;
  if (nextBtn) nextBtn.textContent = stepNo === 8 ? "완료" : "다음";
  if (nextBtn) nextBtn.disabled = false;

  // Progress updates only for 1~7.
  renderProgress(Math.min(stepNo, 7));
  updateProgressDots(Math.min(stepNo, 7));
}

function validateStep(stepNo, state) {
  if (stepNo === 1) {
    if (!state.problems.length) return "문제 영역을 최소 1개 선택해주세요.";
  }
  if (stepNo === 2) {
    if (!state.arrivalDate) return "입국 예정일을 선택해주세요.";
  }
  if (stepNo === 3) {
    if (!state.familyType) return "가족 구성 항목을 선택해주세요.";
  }
  if (stepNo === 4) {
    if (!state.stayWeeks || state.stayWeeks < 1) return "거주 예정 주를 입력해주세요.";
  }
  if (stepNo === 5) {
    if (!state.preferredLanguage) return "선호 언어를 선택해주세요.";
  }
  if (stepNo === 6) {
    if (!state.budgetRange) return "예산 범위를 선택해주세요.";
  }
  if (stepNo === 7) {
    if (!state.helpLevel) return "도움 필요 정도를 선택해주세요.";
  }
  return "";
}

function buildMockRecommendations(state) {
  // This is intentionally static for now:
  // There is no customer survey execution/recommendation API yet in backend.
  const selected = state.problems;
  const problemsSet = new Set(selected);

  const recoMap = {
    immigration: { title: "입국 준비 패키지(기본/가이드)", reason: "입국 일정 기반으로 체크리스트와 다음 단계 안내가 필요합니다." },
    housing: { title: "거주/집 구하기 지원 패키지(기본/확장)", reason: "거주 기간·언어에 맞춰 필요한 절차를 묶어드립니다." },
    car: { title: "자동차 준비 패키지(절차 중심)", reason: "이동 필요성이 있어 관련 진행 흐름이 달라집니다." },
    school: { title: "학교 등록 지원 패키지(시기 대응)", reason: "가족 구성/입국 시점을 반영해 준비 우선순위를 제안합니다." },
    admin: { title: "생활 행정 지원 패키지(서류 흐름)", reason: "생활 행정 업무의 문서 흐름과 타이밍을 정리합니다." },
    llc: { title: "LLC 설립 가이드 패키지(설립 단계)", reason: "목표 일정에 맞춰 단계별 진행 포인트를 안내합니다." },
  };

  const all = Object.keys(recoMap).filter((k) => problemsSet.has(k));
  if (!all.length) return [];

  // Budget + helpLevel influence which “tier” wording we show.
  const budgetTier =
    state.budgetRange === "10k+" ? "프리미엄" : state.budgetRange === "6-10k" ? "확장" : state.budgetRange === "3-6k" ? "표준" : "기본";
  const helpTone =
    state.helpLevel === "high_help" || state.helpLevel === "almost_done"
      ? "인-퍼슨(사람 도움) 비중을 높여"
      : state.helpLevel === "balanced"
      ? "자동 안내 + 보조 방식으로"
      : "셀프 진행 중심으로";

  return all.slice(0, 3).map((k) => {
    const r = recoMap[k];
    return {
      key: k,
      title: `${r.title} · ${budgetTier} · ${helpTone}`,
      reason: r.reason,
    };
  });
}

function setSummary(state) {
  const probsEl = qs("#summaryProblems");
  const commonEl = qs("#summaryCommon");
  const recoEl = qs("#mockRecommendations");

  const problemsText = state.problems
    .map((k) => PROBLEMS.find((p) => p.key === k)?.title || k)
    .join(", ");

  const helpPreview =
    state.helpLevel === "high_self"
      ? "직접 진행 가능: 높음, 도움 필요: 낮음"
      : state.helpLevel === "mid_self"
      ? "직접 진행 가능: 중간, 도움 필요: 중간"
      : state.helpLevel === "balanced"
      ? "직접 진행 가능: 중간, 도움 필요: 중간(균형)"
      : state.helpLevel === "high_help"
      ? "직접 진행 가능: 낮음, 도움 필요: 높음"
      : "직접 진행 가능: 매우 낮음, 도움 필요: 매우 높음";

  if (probsEl) {
    probsEl.innerHTML = `
      <strong>선택한 문제 영역</strong>
      <div>${problemsText}</div>
    `;
  }

  if (commonEl) {
    commonEl.innerHTML = `
      <strong>공통 질문 답변</strong>
      <div class="lhai-text-muted">
        입국 예정일: ${state.arrivalDate || "-"}<br/>
        가족 구성: ${state.familyType || "-"}<br/>
        거주 예정 주: ${state.stayWeeks ?? "-"}주<br/>
        선호 언어: ${state.preferredLanguage || "-"}<br/>
        예산 범위: ${state.budgetRange || "-"}<br/>
        도움 필요: ${helpPreview}
      </div>
    `;
  }

  const recos = buildMockRecommendations(state);
  if (recoEl) {
    if (!recos.length) {
      recoEl.innerHTML = `<div class="lhai-help">선택한 문제 영역을 기반으로 추천을 준비할게요.</div>`;
      return;
    }
    recoEl.innerHTML = recos
      .map(
        (r) => `
          <div class="survey-reco-item">
            <div style="font-weight: 900; margin-bottom: 6px;">${r.title}</div>
            <div class="lhai-help" style="margin:0;">${r.reason}</div>
          </div>
        `
      )
      .join("");
  }
}

function helpLevelPreviewText(helpLevel) {
  if (!helpLevel) return "선택 전";
  if (helpLevel === "high_self") return "직접 진행 가능: 높음 / 도움 필요: 낮음";
  if (helpLevel === "mid_self") return "직접 진행 가능: 중간 / 도움 필요: 중간";
  if (helpLevel === "balanced") return "직접 진행 가능: 중간 / 도움 필요: 중간(균형)";
  if (helpLevel === "high_help") return "직접 진행 가능: 낮음 / 도움 필요: 높음";
  if (helpLevel === "almost_done") return "직접 진행 가능: 매우 낮음 / 도움 필요: 매우 높음";
  return "선택됨";
}

function initSurveyStartPage() {
  let step = 1;

  const state = {
    problems: [],
    arrivalDate: "",
    familyType: "",
    stayWeeks: 0,
    preferredLanguage: "",
    budgetRange: "",
    helpLevel: "",
  };

  // Progress init
  renderProgress(1);
  showStep(1);

  // Step 1 multi-select
  const problemCards = document.querySelectorAll(".survey-problem-card");
  problemCards.forEach((card) => {
    card.addEventListener("click", () => {
      const pressed = card.getAttribute("aria-pressed") === "true";
      card.setAttribute("aria-pressed", pressed ? "false" : "true");
      const selected = getSelectedProblems();
      state.problems = selected;
      const status = qs("#surveyStep1Status");
      if (status) status.textContent = `선택한 문제 영역: ${selected.length}개`;
    });
  });

  // Help level preview
  const helpLevelSel = qs("#helpLevel");
  const helpPreview = qs("#helpLevelPreview");
  helpLevelSel?.addEventListener("change", () => {
    state.helpLevel = helpLevelSel.value;
    if (helpPreview) helpPreview.textContent = helpLevelPreviewText(state.helpLevel);
  });

  function readStepState(stepNo) {
    if (stepNo === 1) {
      state.problems = getSelectedProblems();
    }
    if (stepNo === 2) {
      state.arrivalDate = qs("#arrivalDate")?.value || "";
    }
    if (stepNo === 3) {
      state.familyType = qs("#familyType")?.value || "";
    }
    if (stepNo === 4) {
      state.stayWeeks = Number(qs("#stayWeeks")?.value || 0);
    }
    if (stepNo === 5) {
      state.preferredLanguage = qs("#preferredLanguage")?.value || "";
    }
    if (stepNo === 6) {
      state.budgetRange = qs("#budgetRange")?.value || "";
    }
    if (stepNo === 7) {
      state.helpLevel = qs("#helpLevel")?.value || "";
    }
  }

  // Buttons
  const backBtn = qs("#surveyBackBtn");
  const nextBtn = qs("#surveyNextBtn");
  const statusEl = qs("#surveyFormStatus");

  function setButtons() {
    if (backBtn) backBtn.disabled = step <= 1;
    if (nextBtn) {
      nextBtn.textContent = step === 7 ? "진단 요약 보기" : "다음";
      if (step >= 8) nextBtn.disabled = true;
    }
    if (statusEl) statusEl.textContent = "";
  }

  setButtons();

  backBtn?.addEventListener("click", () => {
    setStatus("");
    if (step <= 1) return;
    step -= 1;
    showStep(step);
    if (step === 7) {
      const hl = qs("#helpLevel");
      if (hl) {
        hl.value = state.helpLevel || "";
        if (helpPreview) helpPreview.textContent = helpLevelPreviewText(state.helpLevel);
      }
    }
  });

  nextBtn?.addEventListener("click", () => {
    setStatus("");
    readStepState(step);
    const error = validateStep(step, state);
    if (error) {
      setStatus(error);
      return;
    }

    if (step === 1) {
      // 7단계: 선택한 필요 영역에 따라 분기 설문 페이지로 이동합니다.
      const mappedNeeds = Array.from(
        new Set(
          (state.problems || [])
            .map((key) => {
              if (key === "immigration") return "arrival_setup";
              if (key === "housing") return "housing";
              if (key === "car") return "mobility";
              if (key === "school") return "family_school";
              if (key === "admin" || key === "llc") return "admin_business";
              return null;
            })
            .filter(Boolean)
        )
      );

      if (!mappedNeeds.length) {
        setStatus("선택한 필요 영역이 올바르지 않습니다. 다시 선택해주세요.");
        return;
      }

      window.location.href = `survey-branching.html?needs=${encodeURIComponent(mappedNeeds.join(","))}`;
      return;
    } else if (step === 2) {
      step = 3;
    } else if (step === 3) {
      step = 4;
    } else if (step === 4) {
      step = 5;
    } else if (step === 5) {
      step = 6;
    } else if (step === 6) {
      step = 7;
    } else if (step === 7) {
      // Build summary step 8
      setSummary(state);
      step = 8;
      showStep(8);
      setStatus("");
    }

    setButtons();
  });
}

initSurveyStartPage();

export {};
void 0;

