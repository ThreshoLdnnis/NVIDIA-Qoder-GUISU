/* =============================================================
   归塑 ReForm · 交互演示原型运行时
   数据：./data/sample-case.json（虚构示例）  状态：sessionStorage
   ============================================================= */
(function () {
  "use strict";

  var DATA_URL = "data/sample-case.json";
  var FALLBACK_URL = "data/sample-case.js";
  var STATE_KEY = "reform.demo.case.state.v2";

  var caseData = null;
  var state = null;
  var playTimer = 0;
  var exportedYet = false;

  /* ---------------- 数据载入 ---------------- */
  function loadCase() {
    return fetch(DATA_URL, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = FALLBACK_URL;
          s.onload = function () {
            if (window.REFORM_CASE_FALLBACK) resolve(window.REFORM_CASE_FALLBACK);
            else reject(new Error("示例数据不可用"));
          };
          s.onerror = function () { reject(new Error("示例数据载入失败")); };
          document.head.appendChild(s);
        });
      });
  }

  /* ---------------- 状态 ---------------- */
  function defaultState() {
    var inv = {};
    caseData.materials.forEach(function (m) { inv[m.id] = m.quantity; });
    return { inventory: inv, selectedPlan: caseData.plans[0].id, asmStep: 0, confirmed: {}, history: [], activeStep: 1 };
  }
  function restoreState() {
    var base = defaultState();
    try {
      var raw = sessionStorage.getItem(STATE_KEY);
      if (!raw) return base;
      var saved = JSON.parse(raw);
      Object.keys(base.inventory).forEach(function (id) {
        var v = Number(saved.inventory && saved.inventory[id]);
        if (Number.isFinite(v) && v >= 0) base.inventory[id] = Math.min(99, Math.floor(v));
      });
      if (saved.selectedPlan && caseData.plans.some(function (p) { return p.id === saved.selectedPlan; })) {
        base.selectedPlan = saved.selectedPlan;
      }
      if (Number.isInteger(saved.asmStep)) base.asmStep = Math.max(0, Math.min(5, saved.asmStep));
      if (Array.isArray(saved.history)) base.history = saved.history.filter(function (h) { return h && typeof h.label === "string"; }).slice(-100);
      if (Number.isInteger(saved.activeStep)) base.activeStep = Math.max(1, Math.min(5, saved.activeStep));
      if (saved.confirmed && typeof saved.confirmed === "object") base.confirmed = saved.confirmed;
    } catch (e) { /* 会话数据损坏时回到初始案例 */ }
    return base;
  }
  function persist() {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* ---------------- 工具 ---------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function byId(id) { return document.getElementById(id); }
  function material(id) {
    return caseData.materials.filter(function (m) { return m.id === id; })[0] || null;
  }
  function gramsToKg(g) { return (g / 1000).toFixed(2); }

  /* =============================================================
     方案缺口计算：站点运行时真实逻辑
     代码展示区 B 通过 computePlanStatus.toString() 输出本函数源码
     ============================================================= */
  /* EXPOSE-START */
  function computePlanStatus(plan, inventory) {
    var items = [];          // 逐条材料的缺口明细
    var gapTotal = 0;        // 缺口合计（件）
    var neededMassG = 0;     // 方案所需材料总重（演示值，克）

    Object.keys(plan.requirements).forEach(function (id) {
      var required = plan.requirements[id];
      var available = Object.prototype.hasOwnProperty.call(inventory, id) ? inventory[id] : 0;
      var gap = Math.max(0, required - available);   // gap = max(0, 需求 − 库存)
      var m = material(id);
      gapTotal += gap;
      if (m) neededMassG += required * m.massG;
      items.push({
        id: id,
        name: m ? m.name : id,
        category: m ? m.category : "—",
        dimensions: m ? m.dimensions : "—",
        required: required,
        available: available,
        gap: gap,
        enough: gap === 0
      });
    });

    // 全部材料缺口为 0 才算可行；缺登记的材料按 available = 0 处理
    var feasible = items.every(function (i) { return i.gap === 0; });

    return {
      planId: plan.id,
      planName: plan.name,
      feasible: feasible,
      gapTotal: gapTotal,
      gapItems: items.filter(function (i) { return i.gap > 0; }),
      neededMassKg: Number(gramsToKg(neededMassG))
    };
  }

  function inventoryTotals(inventory) {
    var qty = 0, massG = 0;
    Object.keys(inventory).forEach(function (id) {
      var m = material(id);
      qty += inventory[id];
      if (m) massG += inventory[id] * m.massG;
    });
    return { qty: qty, massKg: Number(gramsToKg(massG)) };
  }
  /* EXPOSE-END */

  function allPlanStatuses() {
    return caseData.plans.map(function (p) { return computePlanStatus(p, state.inventory); });
  }

  /* =============================================================
     步骤 1：材料护照
     ============================================================= */
  function confidenceLabel(m) {
    // 置信状态由来源与是否存在测量/检测证据推导；示例数据一律为最低级
    if (m.provenance === "虚构示例") return { text: "示例值 · 未实测", cls: "conf-low" };
    return { text: "待核验", cls: "conf-low" };
  }

  function renderPassports() {
    var box = byId("passport-list");
    box.textContent = "";
    caseData.materials.forEach(function (m) {
      var conf = confidenceLabel(m);
      var card = el("article", "passport");
      card.appendChild(el("p", "pid", m.id));
      card.appendChild(el("h4", null, m.name));

      var dl = el("dl");
      [["材料类别", m.category],
       ["尺寸（演示值）", m.dimensions],
       ["单件重量（演示值）", m.massG + " g"],
       ["登记数量", m.quantity + " 件（初始）"],
       ["当前可用", state.inventory[m.id] + " 件"],
       ["来源状态", m.provenance],
       ["数据置信", ""]
      ].forEach(function (pair) {
        dl.appendChild(el("dt", null, pair[0]));
        var dd = el("dd", null, pair[1]);
        if (pair[0] === "数据置信") dd.className = conf.cls, dd.textContent = conf.text;
        dl.appendChild(dd);
      });
      card.appendChild(dl);
      card.appendChild(el("p", "risk", "风险备注：" + m.risk));
      box.appendChild(card);
    });
  }

  /* =============================================================
     步骤 2：库存调节
     ============================================================= */
  function renderInventory() {
    var body = byId("inventory-rows");
    body.textContent = "";
    caseData.materials.forEach(function (m) {
      var qty = state.inventory[m.id];
      var tr = el("tr");

      var nameTd = el("td");
      nameTd.setAttribute("data-label", "材料");
      var nameWrap = el("div", "mat-name", m.name);
      nameWrap.appendChild(el("span", null, m.id));
      nameTd.appendChild(nameWrap);
      tr.appendChild(nameTd);

      var catTd = el("td", null, m.category);
      catTd.setAttribute("data-label", "类别");
      tr.appendChild(catTd);

      var massTd = el("td", "qty-flag", m.massG + " g");
      massTd.setAttribute("data-label", "单件");
      tr.appendChild(massTd);

      var ctrlTd = el("td");
      ctrlTd.setAttribute("data-label", "可用数量");
      var stepper = el("div", "stepper");
      var dec = el("button", null, "−");
      dec.type = "button";
      dec.setAttribute("aria-label", "减少 " + m.name + " 数量");
      dec.setAttribute("data-mat", m.id); dec.setAttribute("data-adj", "-1");
      dec.disabled = qty <= 0;
      var inc = el("button", null, "+");
      inc.type = "button";
      inc.setAttribute("aria-label", "增加 " + m.name + " 数量");
      inc.setAttribute("data-mat", m.id); inc.setAttribute("data-adj", "1");
      inc.disabled = qty >= 99;
      var input = el("input");
      input.type = "number";
      input.min = "0"; input.max = "99"; input.step = "1"; input.value = String(qty);
      input.id = "inv-" + m.id;
      input.setAttribute("aria-label", m.name + " 可用数量（件）");
      dec.addEventListener("click", function () { setQty(m.id, qty - 1); });
      inc.addEventListener("click", function () { setQty(m.id, qty + 1); });
      input.addEventListener("change", function () { setQty(m.id, input.value); });
      stepper.appendChild(dec); stepper.appendChild(input); stepper.appendChild(inc);

      var delta = qty - m.quantity;
      if (delta !== 0) {
        stepper.appendChild(el("span", "qty-flag " + (delta < 0 ? "is-short" : ""), (delta > 0 ? "+" : "") + delta));
      }
      ctrlTd.appendChild(stepper);
      tr.appendChild(ctrlTd);
      body.appendChild(tr);
    });

    byId("inv-qty-total").textContent = inventoryTotals(state.inventory).qty + " 件";
    byId("inv-mass-total").textContent = inventoryTotals(state.inventory).massKg + " kg";
  }

  function setQty(id, raw) {
    var n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) n = state.inventory[id];
    n = Math.max(0, Math.min(99, n));
    var before = state.inventory[id];
    var active = document.activeElement;
    var focusId = active && active.id;
    var adj = active && active.getAttribute("data-adj");
    if (before !== n) {
      stopPlay(); state.confirmed = {}; state.asmStep = 0;
      state.inventory[id] = n;
      recordChange(material(id).name + "：" + before + " → " + n + " 件；装配复核已重置");
    }
    persist(); renderAll(true);
    var focusTarget = focusId ? byId(focusId) : adj ? document.querySelector('[data-mat="' + id + '"][data-adj="' + adj + '"]') : null;
    if (focusTarget && focusTarget.disabled) focusTarget = focusTarget.parentNode.querySelector("input");
    if (focusTarget) focusTarget.focus({preventScroll:true});
    byId("case-feedback").textContent = material(id).name + "现有 " + n + " 件。" + (String(raw).trim() === "" || Number(raw) !== n ? "数量已调整为 0–99 的整数。" : "方案与护照已同步更新。");
  }

  /* =============================================================
     步骤 2/3：汇总 + 方案比较
     ============================================================= */
  function renderSummary(statuses) {
    var tot = inventoryTotals(state.inventory);
    var feasible = statuses.filter(function (s) { return s.feasible; }).length;
    var gapSum = statuses.filter(function (s) { return s.planId === state.selectedPlan; })[0].gapTotal;

    byId("sum-qty").textContent = tot.qty + " 件";
    byId("sum-mass").textContent = tot.massKg + " kg";

    var f = byId("sum-feasible");
    f.textContent = feasible + " / " + statuses.length;
    f.className = feasible > 0 ? "ok" : "warn";

    var g = byId("sum-gap");
    g.textContent = gapSum + " 件";
    g.className = gapSum === 0 ? "ok" : "warn";

    var live = document.querySelector(".live-summary");
    live.setAttribute("aria-busy", "true");
    window.setTimeout(function () { live.setAttribute("aria-busy", "false"); }, 320);
  }

  function renderPlans(statuses) {
    var box = byId("plan-list");
    box.textContent = "";
    caseData.plans.forEach(function (plan) {
      var st = statuses.filter(function (s) { return s.planId === plan.id; })[0];
      var selected = plan.id === state.selectedPlan;

      var card = el("article", "plan");
      card.dataset.plan = plan.id;
      card.dataset.selected = String(selected);
      card.dataset.feasible = String(st.feasible);

      var head = el("div", "plan-head");
      var titleWrap = el("div");
      titleWrap.appendChild(el("span", "plan-id", plan.id));
      titleWrap.appendChild(el("h4", null, plan.name));
      head.appendChild(titleWrap);
      head.appendChild(el("span", "plan-state " + (st.feasible ? "state-ok" : "state-gap"),
        st.feasible ? "数量齐套" : "存在 " + st.gapTotal + " 件缺口"));
      card.appendChild(head);

      card.appendChild(el("p", "plan-desc", plan.description));

      var table = el("table", "req-table");
      var thead = el("thead");
      var htr = el("tr");
      ["材料", "需求", "可用", "缺口"].forEach(function (h) { htr.appendChild(el("th", null, h)); });
      thead.appendChild(htr);
      table.appendChild(thead);
      var tb = el("tbody");
      // 明细（含无缺口材料）
      (function () {
        var rows = [];
        Object.keys(plan.requirements).forEach(function (id) {
          var m = material(id);
          var req = plan.requirements[id];
          var avail = state.inventory[id] || 0;
          var gap = Math.max(0, req - avail);
          rows.push({ id: id, name: m ? m.name : id, req: req, avail: avail, gap: gap });
        });
        rows.forEach(function (r) {
          var tr = el("tr");
          tr.appendChild(el("td", null, r.name + " " + r.id));
          var td1 = el("td", "num", String(r.req));
          var td2 = el("td", "num", String(r.avail));
          var td3 = el("td", "num");
          var chip = el("span", "gap-chip" + (r.gap > 0 ? " is-gap" : ""), r.gap > 0 ? "缺 " + r.gap : "齐套");
          chip.dataset.gap = String(r.gap);
          td3.appendChild(chip);
          tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
          tb.appendChild(tr);
        });
        table.appendChild(tb);
      })();
      card.appendChild(table);

      var foot = el("div", "plan-foot");
      var btn = el("button", "btn " + (selected ? "btn-ghost" : "btn-primary") + " btn-sm",
        selected ? "已选为装配方案" : "选为装配方案");
      btn.type = "button";
      btn.dataset.selectPlan = plan.id;
      btn.setAttribute("aria-pressed", String(selected));
      foot.appendChild(btn);
      foot.appendChild(el("span", "micro-note", "用料合计 " + st.neededMassKg + " kg（演示值）"));
      if (plan.id === caseData.plans[0].id) foot.appendChild(el("span", "select-flag", "默认展示"));
      card.appendChild(foot);

      box.appendChild(card);
    });
  }

  /* =============================================================
     步骤 4：装配示意预演
     ============================================================= */
  function currentPlan() {
    return caseData.plans.filter(function (p) { return p.id === state.selectedPlan; })[0] || caseData.plans[0];
  }

  function stepRisks(plan, idx) {
    var st = computePlanStatus(plan, state.inventory);
    var risks = st.gapItems.map(function (i) {
      var m = material(i.id);
      return "缺口 " + i.gap + " 件：" + i.name + "——" + (m ? m.risk : "");
    });
    var generic = [
      ["确认示例工牌与材料护照编号一致，工具与夹具就位。"],
      ["检查连接件孔位与紧固件规格；示意预演不含公差与受力校核。"],
      ["确认模块定位与间隙仅为顺序示意，不代表可装配性验证。"],
      ["复核紧固顺序与扭矩；扭矩数值需由真实工艺确定，本站未提供。"],
      ["人工进行外观、锐边、稳固度检查并记录结论，未通过则回到方案环节。"]
    ];
    return risks.concat(generic[idx] || []);
  }

  function renderAssembly() {
    var plan = currentPlan();
    var steps = plan.steps;
    var list = byId("asm-steps");
    list.textContent = "";
    steps.forEach(function (title, i) {
      var li = el("li", "asm-step");
      li.appendChild(el("span", "dot", String(i + 1)));
      li.appendChild(el("span", null, title));
      if (i + 1 === state.asmStep) li.className += " is-current";
      else if (i + 1 < state.asmStep) li.className += " is-done";
      list.appendChild(li);
    });

    renderAssemblyGraphic(plan);
    byId("asm-prev").disabled = state.asmStep === 0;
    byId("asm-next").disabled = state.asmStep >= steps.length;

    var pct = steps.length ? state.asmStep / steps.length : 0;
    byId("asm-progress").style.transform = "scaleX(" + pct.toFixed(3) + ")";
    byId("asm-progress-text").textContent = "步骤 " + state.asmStep + " / " + steps.length +
      "（" + Math.round(pct * 100) + "%）";

    var detail = byId("asm-detail");
    detail.textContent = "";
    if (state.asmStep === 0) {
      detail.appendChild(el("h4", null, "尚未开始预演"));
      detail.appendChild(el("p", null, "点击“下一步”按所选方案「" + plan.name + "」逐步展开示意装配顺序。动画仅表达先后关系，标注为示意预演。"));
      return;
    }
    var idx = state.asmStep - 1;
    detail.appendChild(el("h4", null, "步骤 " + (idx + 1) + "：" + steps[idx]));
    detail.appendChild(el("p", "micro-label", "本步骤新增用料（示例）"));
    var chips = el("div", "chips");
    var stageMaterials = stepMaterials(plan, state.asmStep);
    Object.keys(stageMaterials).forEach(function (id) {
      var m = material(id);
      var gap = Math.max(0, plan.requirements[id] - (state.inventory[id] || 0));
      var c = el("span", "chip" + (gap > 0 ? " short" : ""),
        (m ? m.name : id) + " × " + stageMaterials[id] + (gap > 0 ? "（整套方案缺 " + gap + "）" : ""));
      chips.appendChild(c);
    });
    if (!Object.keys(stageMaterials).length) chips.appendChild(el("span", "chip", "检查步骤，无新增用料"));
    detail.appendChild(chips);

    detail.appendChild(el("p", "micro-label", "风险检查（示例提示）"));
    var ul = el("ul");
    stepRisks(plan, idx).forEach(function (r) { ul.appendChild(el("li", null, r)); });
    detail.appendChild(ul);

    var label = el("label", "confirm-row");
    var cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!state.confirmed[state.selectedPlan + "-" + state.asmStep];
    cb.dataset.confirmStep = state.selectedPlan + "-" + state.asmStep;
    label.appendChild(cb);
    label.appendChild(el("span", null, "人工确认：本人已复核本步骤的检查项（演示记录，不代表真实复核）"));
    detail.appendChild(label);
  }

  function setAsmStep(n) {
    var plan = currentPlan();
    state.asmStep = Math.max(0, Math.min(plan.steps.length, n));
    persist();
    renderAssembly();
    refreshArchive();
  }

  function togglePlay(btn) {
    if (playTimer) {
      window.clearInterval(playTimer); playTimer = 0;
      btn.textContent = "自动播放"; btn.setAttribute("aria-pressed", "false");
      return;
    }
    if (state.asmStep >= currentPlan().steps.length) setAsmStep(0);
    btn.textContent = "暂停"; btn.setAttribute("aria-pressed", "true");
    playTimer = window.setInterval(function () {
      if (state.asmStep >= currentPlan().steps.length) { togglePlay(btn); return; }
      setAsmStep(state.asmStep + 1);
    }, 1400);
  }

  /* =============================================================
     步骤 5：档案导出
     ============================================================= */
  function buildArchive() {
    var statuses = allPlanStatuses();
    var plan = currentPlan();
    var selected = statuses.filter(function (s) { return s.planId === plan.id; })[0];
    var tot = inventoryTotals(state.inventory);
    return {
      meta: {
        exportedAt: new Date().toISOString(),
        caseId: caseData.caseId,
        caseTitle: caseData.title,
        revision: caseData.revision,
        statusLabel: "示例演示原型 / 虚构示例数据",
        dataSource: "data/sample-case.json",
        environmentNote: caseData.environmentalNote,
        calculationRule: caseData.calculation,
        disclaimer: "本档案由浏览器内规则演示生成，不代表已完成材料识别、成分检测、结构验证、物理仿真、设备联动或减碳核算。"
      },
      inventory: caseData.materials.map(function (m) {
        return {
          id: m.id, name: m.name, category: m.category,
          dimensions: m.dimensions, massG: m.massG,
          initialQuantity: m.quantity, currentQuantity: state.inventory[m.id],
          provenance: m.provenance, confidence: confidenceLabel(m).text, risk: m.risk
        };
      }),
      totals: { availableQty: tot.qty, availableMassKg: tot.massKg },
      plans: statuses.map(function (s) {
        return { id: s.planId, name: s.planName, feasible: s.feasible, gapTotal: s.gapTotal, neededMassKg: s.neededMassKg };
      }),
      selectedPlan: {
        id: plan.id, name: plan.name, description: plan.description,
        requirements: plan.requirements, gaps: selected.gapItems, feasible: selected.feasible
      },
      assembly: {
        label: "示意预演（非物理仿真）",
        steps: plan.steps.map(function (title, i) {
          return { index: i + 1, title: title, manuallyConfirmed: !!state.confirmed[plan.id + "-" + (i + 1)] };
        })
      },
      changeHistory: state.history.slice(),
      riskStatements: caseData.materials.map(function (m) { return m.id + "：" + m.risk; })
    };
  }

  function verifyArchive(archive) {
    var dom = {
      qty: parseInt(byId("sum-qty").textContent, 10),
      chips: Array.prototype.map.call(document.querySelectorAll(".gap-chip"), function (n) { return Number(n.dataset.gap); }),
      planStates: Array.prototype.map.call(document.querySelectorAll(".plan"), function (n) {
        return { id: n.dataset.plan, feasible: n.dataset.feasible === "true" };
      })
    };
    var exportGapSum = archive.plans.reduce(function (a, p) { return a + p.gapTotal; }, 0);
    var domGapSum = dom.chips.reduce(function (a, b) { return a + b; }, 0);
    var feasibleMatch = archive.plans.every(function (p) {
      return dom.planStates.some(function (d) { return d.id === p.id && d.feasible === p.feasible; });
    });
    return {
      ok: dom.qty === archive.totals.availableQty && domGapSum === exportGapSum && feasibleMatch,
      qty: dom.qty === archive.totals.availableQty,
      gap: domGapSum === exportGapSum,
      feasible: feasibleMatch,
      domQty: dom.qty,
      exportQty: archive.totals.availableQty,
      exportGapSum: exportGapSum,
      domGapSum: domGapSum
    };
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function stamp() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, "0"); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function printableArchive(archive) {
    var rows = archive.inventory.map(function (m) {
      return "<tr><td>" + m.id + "</td><td>" + m.name + "</td><td>" + m.category + "</td><td>" + m.dimensions +
        "</td><td>" + m.currentQuantity + "</td><td>" + m.confidence + "</td></tr>";
    }).join("");
    var gaps = archive.selectedPlan.gaps.length
      ? archive.selectedPlan.gaps.map(function (g) {
          return "<li>" + g.name + "（" + g.id + "）需 " + g.required + "，可用 " + g.available + "，缺 " + g.gap + "</li>";
        }).join("")
      : "<li>当前库存下所选方案无缺口</li>";
    return "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>归塑 ReForm 案例档案 " +
      archive.meta.caseId + "</title><style>body{font-family:\"Microsoft YaHei\",sans-serif;color:#12202c;margin:32px;line-height:1.7}" +
      "h1{font-size:20px}h2{font-size:15px;margin-top:22px}table{border-collapse:collapse;width:100%;font-size:12px}" +
      "th,td{border:1px solid #9db0c4;padding:6px;text-align:left}th{background:#eef3f8}.warn{border:2px solid #c0562a;" +
      "padding:10px 12px;font-size:12px;color:#8a3d18}ul{font-size:12px}footer{margin-top:26px;font-size:11px;color:#5b6f82}" +
      "@media print{body{margin:12mm}}</style></head><body>" +
      "<div class=\"warn\"><strong>示例演示档案</strong>：材料、尺寸、重量与装配步骤均为虚构示例，未进行成分识别、结构验证、物理仿真或减碳核算。</div>" +
      "<h1>归塑 ReForm 案例档案 · " + archive.meta.caseTitle + "</h1>" +
      "<p>导出时间：" + archive.meta.exportedAt + "<br>案例编号：" + archive.meta.caseId + "　版本：" + archive.meta.revision +
      "<br>状态标签：" + archive.meta.statusLabel + "<br>数据来源：" + archive.meta.dataSource + "</p>" +
      "<h2>当前库存（" + archive.totals.availableQty + " 件 / " + archive.totals.availableMassKg + " kg 演示值）</h2>" +
      "<table><thead><tr><th>ID</th><th>名称</th><th>类别</th><th>尺寸（演示值）</th><th>可用数量</th><th>数据置信</th></tr></thead><tbody>" +
      rows + "</tbody></table>" +
      "<h2>所选方案：" + archive.selectedPlan.name + "（" + archive.selectedPlan.id + "）</h2>" +
      "<p>" + archive.selectedPlan.description + "　可行状态：" + (archive.selectedPlan.feasible ? "可行" : "存在缺口") + "</p><ul>" + gaps + "</ul>" +
      "<h2>候选方案状态</h2><table><thead><tr><th>方案</th><th>可行</th><th>缺口合计</th><th>用料总重</th></tr></thead><tbody>" +
      archive.plans.map(function (p) {
        return "<tr><td>" + p.id + " " + p.name + "</td><td>" + (p.feasible ? "是" : "否") + "</td><td>" + p.gapTotal + " 件</td><td>" + p.neededMassKg + " kg</td></tr>";
      }).join("") + "</tbody></table>" +
      "<h2>装配步骤（示意预演，非物理仿真）</h2><ul>" + archive.assembly.steps.map(function (s) {
        return "<li>" + s.index + ". " + s.title + (s.manuallyConfirmed ? "（已勾选人工确认）" : "（未确认）") + "</li>";
      }).join("") + "</ul>" +
      "<h2>本次修改记录</h2><ul>" + archive.changeHistory.map(function (h) { return "<li>" + escapeHtml(h.at) + " · " + escapeHtml(h.label) + "</li>"; }).join("") + "</ul>" +
      "<h2>风险声明</h2><ul>" + archive.riskStatements.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul>" +
      "<p>" + archive.meta.environmentNote + "</p>" +
      "<footer>本档案由归塑 ReForm 交互演示原型生成，内容可被真实材料记录替换后重新导出。</footer></body></html>";
  }

  /* =============================================================
     代码展示区 + 语法着色
     ============================================================= */
  var TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*")|(\b\d+(?:\.\d+)?\b)|\b(const|let|var|function|return|if|else|for|while|new|typeof|Object|Math|Number|String|Array|JSON|every|map|filter|reduce|forEach)\b/g;

  function highlight(src) {
    var esc = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // 单次扫描，避免二次替换注入的标签
    return esc.replace(TOKEN_RE, function (match, com, str, num, key) {
      if (com) return '<span class="tok-com">' + com + "</span>";
      if (str) return '<span class="tok-str">' + str + "</span>";
      if (num) return '<span class="tok-num">' + num + "</span>";
      if (key) return '<span class="tok-key">' + key + "</span>";
      return match;
    });
  }

  function renderCodeAreas() {
    var first = caseData.materials[0];
    byId("code-passport").innerHTML = highlight(
      "// 运行时载入的示例记录（JSON.stringify 输出）\n" + JSON.stringify(first, null, 2) +
      "\n\n// 站点内部结构（含推导出的置信状态）\n" +
      JSON.stringify({ passport: first, confidence: confidenceLabel(first).text, currentQuantity: state.inventory[first.id] }, null, 2)
    );
    byId("code-gap").innerHTML = highlight(computePlanStatus.toString() + "\n\n" + inventoryTotals.toString());
    byId("code-rule").textContent = caseData.calculation;
  }

  /* =============================================================
     代码标签页
     ============================================================= */
  function wireTabs(tabSelector) {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(tabSelector));
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { activate(tabs, tab); });
      tab.addEventListener("keydown", function (e) {
        var dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        var next = tabs[(i + dir + tabs.length) % tabs.length];
        activate(tabs, next); next.focus();
      });
    });
  }
  function activate(tabs, tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      var pane = byId(t.getAttribute("aria-controls"));
      if (pane) pane.hidden = !on;
    });
  }

  /* =============================================================
     渲染主循环
     ============================================================= */
  function renderAll(full) {
    var statuses = allPlanStatuses();
    renderInventory();
    renderSummary(statuses);
    renderPlans(statuses);
    renderPassports();
    renderAssembly();
    renderCodeAreas();
    refreshArchive();
  }

  function bindGlobal() {
    document.addEventListener("click", function (e) {
      var sel = e.target.closest("[data-select-plan]");
      if (sel) {
        if (state.selectedPlan === sel.dataset.selectPlan) return;
        stopPlay(); state.confirmed = {};
        state.selectedPlan = sel.dataset.selectPlan;
        state.asmStep = 0;
        recordChange("选择方案：" + currentPlan().name + "；装配复核已重置");
        persist();
        renderAll(false);
        var selectedControl = document.querySelector('[data-select-plan="' + state.selectedPlan + '"]');
        if (selectedControl && !byId("step-3").hidden) selectedControl.focus({ preventScroll: true });
        byId("case-feedback").textContent = "装配方案已切换为「" + currentPlan().name + "」，需求清单、缺口与装配顺序已按新方案刷新，此前的复核记录已作废。";
        return;
      }
      if (e.target.closest("#reset-case")) {
        try { sessionStorage.removeItem(STATE_KEY); } catch (err) { }
        state = defaultState();
        stopPlay();
        persist();
        renderAll(true);
        navigateCaseStep(1);
        byId("case-feedback").textContent = "已恢复 data/sample-case.json 的初始库存与默认方案，本次修改记录已清空。";
        exportedYet = false;
        byId("export-check").textContent = "未导出。点击按钮后会校验导出内容与画面数值是否一致。";
      }
    });
    document.addEventListener("change", function (e) {
      var cb = e.target.closest && e.target.closest("[data-confirm-step]");
      if (!cb) return;
      state.confirmed[cb.dataset.confirmStep] = cb.checked;
      persist(); renderAssemblyGraphic(currentPlan()); refreshArchive(); markExportStale();
    });
    byId("asm-prev").addEventListener("click", function () { setAsmStep(state.asmStep - 1); });
    byId("asm-next").addEventListener("click", function () { setAsmStep(state.asmStep + 1); });
    byId("asm-play").addEventListener("click", function () { togglePlay(this); });
    byId("export-json").addEventListener("click", function () {
      var archive = buildArchive();
      var v = verifyArchive(archive);
      download("ReForm-" + archive.meta.caseId + "-" + stamp() + ".json", JSON.stringify(archive, null, 2), "application/json");
      exportedYet = true;
      byId("export-check").textContent = v.ok
        ? "已导出并校验：档案与画面数值一致（可用库存 " + v.domQty + " 件，所选方案缺口 " + archive.selectedPlan.gaps.reduce(function (sum, item) { return sum + item.gap; }, 0) + " 件；两个候选方案的状态均已核对）。"
        : "已导出，但校验发现画面与档案不一致（库存 " + v.domQty + "/" + v.exportQty + " 件、缺口 " + v.domGapSum + "/" + v.exportGapSum + " 件、状态吻合 " + v.feasible + "），请反馈。";
    });
    byId("export-html").addEventListener("click", function () {
      var archive = buildArchive();
      download("ReForm-" + archive.meta.caseId + "-" + stamp() + ".html", printableArchive(archive), "text/html");
      exportedYet = true;
      byId("export-check").textContent = "已导出可打印档案（含时间、版本、库存、所选方案、缺口、风险声明与状态标签）。";
    });
    wireTabs("#code .tab");
  }


  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function(c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function stopPlay() {
    if (playTimer) window.clearInterval(playTimer);
    playTimer = 0;
    byId("asm-play").textContent = "自动播放";
    byId("asm-play").setAttribute("aria-pressed", "false");
  }
  function recordChange(label) {
    state.history.push({at:new Date().toISOString(),label:label,inventory:Object.assign({},state.inventory),planId:state.selectedPlan,gap:computePlanStatus(currentPlan(),state.inventory).gapTotal});
    state.history = state.history.slice(-100);
    markExportStale();
  }
  function markExportStale() {
    if (!exportedYet) return;
    exportedYet = false;
    byId("export-check").textContent = "画面内容已再次修改，上一次导出结果与当前状态不再一致，请重新导出校验。";
  }
  function stepMaterials(plan, step) {
    var stages = plan.id === "PLAN-A" ? {2:{"MAT-W01":1,"MAT-M01":4,"MAT-F01":4},3:{"MAT-E01":2},4:{"MAT-F01":4}} : {2:{"MAT-E01":2,"MAT-F01":2},3:{"MAT-W01":1},4:{"MAT-M01":2,"MAT-F01":4}};
    return stages[step] || {};
  }
  function renderAssemblyGraphic(plan) {
    var b = plan.id === "PLAN-B", n = state.asmStep;
    var metal = b ? 2 : 4, bolt = b ? 6 : 8;
    var count = n >= 4 ? bolt : n >= 2 ? (b ? 2 : 4) : 0;
    var svg = byId("asm-svg");
    var base = '<title id="asm-svg-title">'+escapeHtml(plan.name)+' 装配顺序示意 · 步骤 '+n+' / '+plan.steps.length+'</title>'+
      '<desc id="asm-svg-desc">深色工作台上的示意图：木板底座、金属角码、电子外壳与紧固件随步骤逐层出现，仅表达先后顺序，不代表受力、公差或可装配性。</desc>'+
      '<rect width="420" height="300" rx="14" fill="#0c0e13"/><text x="24" y="35" class="asm-text">'+escapeHtml(plan.name)+' · 示意预演</text>';
    if(n >= (b ? 3 : 2)) base += '<rect x="88" y="110" width="244" height="150" rx="6" class="shape-wood"/>';
    if(n >= (b ? 4 : 2)) [[88,110],[308,236],[308,110],[88,236]].slice(0,metal).forEach(function(p){base += '<rect x="'+p[0]+'" y="'+p[1]+'" width="24" height="24" rx="3" class="shape-metal"/>';});
    if(n >= (b ? 2 : 3)) base += '<rect x="125" y="150" width="100" height="65" rx="5" class="shape-shell"/><rect x="240" y="150" width="55" height="65" rx="5" class="shape-shell"/>';
    for(var i=0;i<count;i++) base += '<circle cx="'+(105+i*28)+'" cy="280" r="5" class="shape-bolt"/>';
    var confirmed = plan.steps.every(function(_,i){return state.confirmed[plan.id+"-"+(i+1)];});
    base += '<text x="24" y="70" class="asm-text">'+(n===0?'点击下一步开始': '步骤 '+n+' / '+plan.steps.length)+' · '+(confirmed?'检查项已勾选（演示）':'检查项待人工勾选')+'</text>';
    svg.innerHTML=base;
  }
  function refreshArchive() {
    var a = buildArchive(), plan = currentPlan(), now = computePlanStatus(plan,state.inventory);
    var initial = computePlanStatus(plan,defaultState().inventory);
    var confirmed = a.assembly.steps.filter(function(x){return x.manuallyConfirmed;}).length;
    byId("archive-summary").textContent = plan.name + " · 初始缺口 " + initial.gapTotal + " 件 → 当前 " + now.gapTotal + " 件 · 已勾选复核 " + confirmed + " / " + plan.steps.length + " 步（演示）";
    byId("export-preview").textContent = JSON.stringify(a,null,2);
    var history = byId("revision-list"); history.textContent = "";
    if(!state.history.length) history.appendChild(el("li",null,"尚无修改。尝试补入两枚螺栓，或选择另一方案。"));
    state.history.slice(-8).reverse().forEach(function(h){history.appendChild(el("li",null,new Date(h.at).toLocaleTimeString('zh-CN',{hour12:false}) + " · " + h.label + " · 所选方案缺口 " + h.gap + " 件"));});
    if(byId("case-current")) byId("case-current").textContent = "当前方案："+plan.name+" · 缺口 "+now.gapTotal+" 件";
  }
  function showCaseStep(n) {
    state.activeStep = Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
    document.querySelectorAll('.step-panels > .panel').forEach(function(p,i){p.hidden=i+1!==state.activeStep;});
    document.querySelectorAll('.rail-link').forEach(function(a,i){a.classList.toggle('is-active',i+1===state.activeStep);if(i+1===state.activeStep)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current');});
    byId('case-prev').disabled=state.activeStep===1; byId('case-next').disabled=state.activeStep===5;
    byId('case-step-label').textContent='第 '+state.activeStep+' / 5 步';
    persist();
  }

  function navigateCaseStep(n) {
    stopPlay();
    showCaseStep(n);
    var panel = byId("step-" + state.activeStep);
    if (location.hash !== "#" + panel.id) history.replaceState(null, "", "#" + panel.id);
    var heading = panel.querySelector("h3");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    panel.scrollIntoView({ block: "start" });
  }

  function wireCaseSteps() {
    var wrap = document.querySelector('.step-panels');
    var controls = el('div','case-step-controls');
    controls.innerHTML='<button class="btn btn-ghost" id="case-prev" type="button">上一步</button><span id="case-step-label"></span><button class="btn btn-primary" id="case-next" type="button">下一步</button>';
    wrap.appendChild(controls);
    var current=el('p','case-current');current.id='case-current';document.querySelector('.step-rail').appendChild(current);
    byId("case-prev").addEventListener("click", function () { navigateCaseStep(state.activeStep - 1); });
    byId("case-next").addEventListener("click", function () { navigateCaseStep(state.activeStep + 1); });
    document.querySelectorAll('a[href^="#step-"]').forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        navigateCaseStep(Number(link.hash.slice(6)));
      });
    });
    document.querySelectorAll("[data-scenario]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.scenario === "complete") {
          setQty("MAT-F01", state.inventory["MAT-F01"] + 2);
          navigateCaseStep(3);
          return;
        }
        stopPlay();
        state = defaultState();
        recordChange("恢复初始情景：" + material("MAT-F01").name + "回到 " + state.inventory["MAT-F01"] + " 件");
        persist();
        renderAll(true);
        navigateCaseStep(2);
        exportedYet = false;
        byId("case-feedback").textContent = "已恢复初始库存与默认方案，装配复核已清空。";
        byId("export-check").textContent = "未导出。点击按钮后会校验导出内容与画面数值是否一致。";
      });
    });
    function stepFromHash() {
      var match = location.hash.match(/^#step-([1-5])$/);
      return match ? Number(match[1]) : null;
    }
    showCaseStep(stepFromHash() || state.activeStep);
    if (stepFromHash()) byId("step-" + state.activeStep).scrollIntoView({ block: "start" });
    window.addEventListener("hashchange", function () {
      var step = stepFromHash();
      if (step) navigateCaseStep(step);
    });
    refreshArchive();
  }

  function boot() {
    loadCase().then(function (data) {
      caseData = data;
      state = restoreState();
      byId("meta-title").textContent = data.title;
      byId("meta-status").textContent = data.status;
      byId("meta-revision").textContent = data.revision;
      bindGlobal();
      renderAll(true);
      wireCaseSteps();
    }).catch(function (err) {
      var error = byId("wb-load-error");
      error.hidden = false;
      error.textContent = "无法加载示例工作台。请刷新后重试，并检查 data/sample-case.json 是否随页面发布。";
      console.error(err);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
