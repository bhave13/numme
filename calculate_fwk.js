/**
 * Numme - Calculate Module Framework
 * Handles multi-step, interactive numeracy calculations.
 * Refactored to a Singleton Object pattern to match ExplainModule.
 */

const CalculateModule = {
  data: [],
  level: 1,
  questions: [],
  qIndex: 0,
  
  // Global stats for the summary screen
  calcStats: { total: 0, firstTry: 0 },
  qResults: [], 
  
  // State for the current question
  cardSequence: [],
  currentCardIndex: 0,
  cardAttempts: 0,

  init: function() {
    // Robustly check for CALCULATE_QA without falling back to EXPLAIN_QA
    if (typeof CALCULATE_QA !== 'undefined') {
      this.data = Array.isArray(CALCULATE_QA) ? CALCULATE_QA : (CALCULATE_QA.questions || []);
    }
  },

  start: function(level = 1) {
    this.level = level;
    
    // If data failed to load due to syntax errors in calculate_qa.js, fetch and fix it dynamically
    if (this.data.length === 0 && typeof CALCULATE_QA === 'undefined') {
      document.getElementById('calc-frozen-pane').style.display = 'block';
      document.getElementById('calc-steps').innerHTML = `<div style="text-align:center; padding: 40px;"><h3>Loading calculations...</h3></div>`;
      
      fetch('calculate_qa.js')
        .then(response => response.text())
        .then(text => {
          // Dynamically strip out the syntax error '[O' that breaks the file
          const fixedText = text.replace(/\[O/g, '');
          
          const script = document.createElement('script');
          script.textContent = fixedText;
          document.head.appendChild(script);
          
          setTimeout(() => {
            if (typeof CALCULATE_QA !== 'undefined') {
              this.data = Array.isArray(CALCULATE_QA) ? CALCULATE_QA : (CALCULATE_QA.questions || []);
            }
            this.processStart();
          }, 50);
        })
        .catch(err => {
          console.error("Failed to dynamically fix calculate_qa.js:", err);
          this.processStart();
        });
    } else {
      this.processStart();
    }
  },

  processStart: function() {
    // Filter questions by level, shuffle, and take up to 10
    const filtered = this.data.filter(q => q.level === this.level);
    this.questions = filtered.sort(() => 0.5 - Math.random()).slice(0, 10);
    
    this.qIndex = 0;
    this.calcStats = { total: 0, firstTry: 0 };
    this.qResults = [];
    
    if (this.questions.length === 0) {
      document.getElementById('calc-frozen-pane').style.display = 'none';
      const errorMsg = typeof CALCULATE_QA === 'undefined' ? 
        "Data failed to load. Please check your data files." : 
        `No questions found for Level ${this.level}.`;
      document.getElementById('calc-steps').innerHTML = `<div style="text-align:center; padding: 40px;"><h3>${errorMsg}</h3></div>`;
      return;
    }
    
    // Ensure panels are visible (in case restarting from summary)
    document.getElementById('calc-frozen-pane').style.display = 'block';
    document.getElementById('calc-scroll-pane').style.display = 'block';
    const summaryEl = document.getElementById('calc-summary');
    if(summaryEl) summaryEl.style.display = 'none';

    this.renderQuestion();
  },

  // --- Utility Methods ---
  parseNum: function(s) {
    return parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  },

  numEq: function(input, expected, strict) {
    const n = this.parseNum(input);
    if (isNaN(n)) return false;
    const tol = strict ? 0.001 : Math.max(0.005, Math.abs(expected) * 0.003);
    return Math.abs(n - expected) <= Math.abs(tol);
  },

  esc: function(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  typeset: function(node) {
    if (!window.MathJax) {
      const t = setInterval(() => {
        if (window.MathJax && MathJax.typesetPromise) {
          clearInterval(t);
          MathJax.startup.promise.then(() => MathJax.typesetPromise([node])).catch(() => {});
        }
      }, 150);
      return;
    }
    const run = () => MathJax.typesetPromise([node]).catch(() => {});
    if (MathJax.startup && MathJax.startup.promise) {
      MathJax.startup.promise.then(run);
    } else {
      run();
    }
  },

  scrollToEl: function(node) {
    // UX Update: Use 'center' so the new step naturally sits between the sticky top and fixed bottom panes
    setTimeout(() => node.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  },

  // --- Core Lifecycle ---
  renderQuestion: function() {
    const q = this.questions[this.qIndex];
    
    // Update UI headers & progress
    const badge = document.getElementById('calc-q-badge');
    if (badge) {
      badge.textContent = `Question ${this.qIndex + 1} of ${this.questions.length}`;
      badge.className = `level-badge l${q.level}`;
    }
    document.getElementById('calc-prog-bar').style.width = ((this.qIndex / this.questions.length) * 100) + '%';

    // Populate context card
    document.getElementById('calc-ctx-text').textContent = q.ctx || q.context;
    document.getElementById('calc-ctx-q').textContent = q.q || q.question;
    
    // Handle optional figure (SVG)
    const ctxQ = document.getElementById('calc-ctx-q');
    let figWrap = document.getElementById('calc-ctx-figure-wrap');
    if (q.figure) {
      if (!figWrap) {
        figWrap = document.createElement('div');
        figWrap.id = 'calc-ctx-figure-wrap';
        figWrap.style.marginBottom = '1.5rem';
        ctxQ.parentNode.insertBefore(figWrap, ctxQ);
      }
      figWrap.innerHTML = q.figure;
      figWrap.style.display = 'block';
    } else if (figWrap) {
      figWrap.style.display = 'none';
      figWrap.innerHTML = '';
    }

    // Build the dynamic sequence of UI cards required for this question
    this.cardSequence = this.buildCardSequence(q);
    
    // Initialize results tracker for this question
    this.qResults.push({
      id: q.id,
      title: q.topic || q.title || `Question ${q.id}`,
      calcsTotal: 0,
      calcsFirstTry: 0
    });

    // Generate dynamic progress dots
    const dotsContainer = document.querySelector('.calc-dots');
    if(dotsContainer) {
      dotsContainer.innerHTML = '';
      this.cardSequence.forEach((_, idx) => {
        const dot = document.createElement('span');
        dot.className = `calc-dot ${idx === 0 ? 'active' : ''}`;
        dot.id = `calc-d${idx + 1}`;
        dot.textContent = idx + 1;
        dotsContainer.appendChild(dot);
      });
    }

    // Reset steps container
    const stepsContainer = document.getElementById('calc-steps');
    stepsContainer.innerHTML = '';
    
    this.currentCardIndex = 0;
    this.renderNextCard();
    
    // UX Update: Smart scroll to the scroll pane offset, rather than absolute window top
    const scrollPane = document.getElementById('calc-scroll-pane');
    if (scrollPane) {
      const y = scrollPane.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  },

  buildCardSequence: function(q) {
    const seq = [];
    if (!q.steps) return seq; // Safety check
    
    q.steps.forEach((step, idx) => {
      // Step 1: Operation Selection (only if opChoice is true)
      if (step.opChoice) {
        seq.push({ type: 'OP', step, calcIdx: idx + 1 });
      }
      // Step 2: Sentence formulation
      seq.push({ type: 'SENTENCE', step, calcIdx: idx + 1 });
      // Step 3: Calculation execution
      seq.push({ type: 'CALC', step, calcIdx: idx + 1 });
    });
    // Final Step: Meaning
    seq.push({ type: 'MEANING', q });
    return seq;
  },

  renderNextCard: function() {
    if (this.currentCardIndex >= this.cardSequence.length) {
      this.finishQuestion();
      return;
    }

    const cardData = this.cardSequence[this.currentCardIndex];
    this.cardAttempts = 0; // Reset attempts for the new card

    // Mark current dot as active
    const dots = document.querySelectorAll('.calc-dot');
    dots.forEach((d, i) => {
      if (i < this.currentCardIndex) d.className = 'calc-dot done';
      else if (i === this.currentCardIndex) d.className = 'calc-dot active';
      else d.className = 'calc-dot';
    });

    let cardEl;
    switch (cardData.type) {
      case 'OP':       cardEl = this.createOpCard(cardData); break;
      case 'SENTENCE': cardEl = this.createSentenceCard(cardData); break;
      case 'CALC':     cardEl = this.createCalcCard(cardData); break;
      case 'MEANING':  cardEl = this.createMeaningCard(cardData); break;
    }

    const stepsContainer = document.getElementById('calc-steps');
    stepsContainer.appendChild(cardEl);
    this.scrollToEl(cardEl);
  },

  advanceToNextCard: function(currentCardEl) {
    currentCardEl.classList.add('done-card');
    const stepNum = currentCardEl.querySelector('.calc-step-num');
    const stepIcon = currentCardEl.querySelector('.calc-step-icon');
    if (stepNum) stepNum.classList.add('done');
    if (stepIcon) stepIcon.textContent = '✅';

    this.currentCardIndex++;
    setTimeout(() => this.renderNextCard(), 550);
  },

  finishQuestion: function() {
    const isLast = this.qIndex >= this.questions.length - 1;
    const stepsContainer = document.getElementById('calc-steps');
    
    const nxt = document.createElement('div');
    nxt.style.marginTop = '14px';
    nxt.style.marginBottom = '20px';
    nxt.className = 'calc-step-card'; // Styling wrapper
    nxt.style.padding = '20px';
    nxt.style.textAlign = 'center';
    
    if (isLast) {
      nxt.innerHTML = `<button class="calc-btn btn-primary" id="calc-finishBtn">🎉 See My Results</button>`;
      nxt.querySelector('#calc-finishBtn').addEventListener('click', () => this.showSummary());
    } else {
      nxt.innerHTML = `<button class="calc-btn btn-primary" id="calc-nextQBtn">Next Question ➜</button>`;
      nxt.querySelector('#calc-nextQBtn').addEventListener('click', () => {
        this.qIndex++;
        this.renderQuestion();
      });
    }
    
    stepsContainer.appendChild(nxt);
    this.scrollToEl(nxt);
  },

  // --- UI Card Generators ---
  
  createOpCard: function(data) {
    const { step, calcIdx } = data;
    const card = document.createElement('div');
    card.className = 'calc-step-card';
    
    let titlePrefix = this.cardSequence.filter(c => c.type === 'OP').length > 1 ? `Calculation ${calcIdx}: ` : '';
    
    card.innerHTML = `
      <div class="calc-step-hd">
        <div class="calc-step-num">${this.currentCardIndex + 1}</div>
        <div class="calc-step-ttl">${titlePrefix}Choose the operation</div>
        <div class="calc-step-icon"></div>
      </div>
      <div class="calc-step-bd">
        <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:13px">
          What mathematical operation do you need to use next?
        </p>
        <div class="calc-op-grid">
          <button class="calc-op-btn" data-op="+">Add &nbsp;(+)</button>
          <button class="calc-op-btn" data-op="−">Subtract &nbsp;(−)</button>
          <button class="calc-op-btn" data-op="×">Multiply &nbsp;(×)</button>
          <button class="calc-op-btn" data-op="÷">Divide &nbsp;(÷)</button>
        </div>
        <div class="calc-fb-container"></div>
      </div>
    `;

    const btns = card.querySelectorAll('.calc-op-btn');
    const fb = card.querySelector('.calc-fb-container');

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.cardAttempts++;
        const chosen = btn.dataset.op;
        if (chosen === step.op) {
          btns.forEach(b => {
            b.disabled = true;
            if (b.dataset.op === step.op) b.classList.add('op-correct');
          });
          fb.innerHTML = `<div class="calc-fb fb-ok">✅ <strong>Correct!</strong> The right operation is <strong>${this.esc(step.opLabel)}</strong>.</div>`;
          this.advanceToNextCard(card);
        } else {
          btn.classList.add('op-wrong');
          setTimeout(() => btn.classList.remove('op-wrong'), 400);
          if (this.cardAttempts === 1) {
            fb.innerHTML = `<div class="calc-fb fb-wrong">❌ Not quite — read the context carefully and try again.</div>`;
          } else {
            fb.innerHTML = `
              <div class="calc-fb fb-wrong">❌ Not quite again — here is a hint:</div>
              <div class="calc-fb fb-hint">💡 ${this.esc(step.hint)}</div>
            `;
          }
        }
      });
    });

    return card;
  },

  createSentenceCard: function(data) {
    const { step, calcIdx } = data;
    const wA = step.aA.s.length > 5 ? ' xwide' : '';
    const wB = step.aB.s.length > 5 ? ' xwide' : '';
    const card = document.createElement('div');
    card.className = 'calc-step-card';

    const infoText = step.opChoice 
      ? `The operation is <strong>${this.esc(step.opLabel)}</strong> — the verb is filled in. Enter the two numbers and explain your reasoning.`
      : `The next operation is <strong>${this.esc(step.opLabel)}</strong>. Enter the two numbers and explain your reasoning.`;

    card.innerHTML = `
      <div class="calc-step-hd">
        <div class="calc-step-num">${this.currentCardIndex + 1}</div>
        <div class="calc-step-ttl">What is operated on what, and why?</div>
        <div class="calc-step-icon"></div>
      </div>
      <div class="calc-step-bd">
        <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:12px">${infoText}</p>
        <div class="calc-starter-sentence">
          "I need to <strong>${this.esc(step.verb)}</strong>&nbsp;
          <input class="calc-blank blank-a${wA}" type="text" placeholder="?" autocomplete="off" spellcheck="false">&nbsp;
          ${this.esc(step.prep)}&nbsp;
          <input class="calc-blank blank-b${wB}" type="text" placeholder="?" autocomplete="off" spellcheck="false">."
        </div>
        <div class="calc-because-row">
          <span class="calc-because-label">because&nbsp;</span>
          <input class="calc-because-input" type="text" placeholder="explain your reasoning…" autocomplete="off">
          <span style="font-size:.97rem;font-weight:600">"</span>
        </div>
        <div class="calc-btn-row">
          <button class="calc-btn btn-primary chk-btn">Check ➜</button>
        </div>
        <div class="calc-fb-container"></div>
      </div>
    `;

    const inputs = card.querySelectorAll('input');
    const checkBtn = card.querySelector('.chk-btn');
    const fb = card.querySelector('.calc-fb-container');

    const handleCheck = () => {
      const vA = card.querySelector('.blank-a').value;
      const vB = card.querySelector('.blank-b').value;
      const vR = card.querySelector('.calc-because-input').value;

      const okA = this.numEq(vA, step.aA.v, true);
      const okB = this.numEq(vB, step.aB.v, true);
      const okR = vR.trim().length >= 8;

      card.querySelector('.blank-a').className = `calc-blank blank-a${wA} ${okA ? 'b-ok' : 'b-err'}`;
      card.querySelector('.blank-b').className = `calc-blank blank-b${wB} ${okB ? 'b-ok' : 'b-err'}`;

      if (!okR) {
        fb.innerHTML = '<div class="calc-fb fb-wrong">❌ Please write your reasoning in the \'because\' box (a few words at least).</div>';
        return;
      }
      if (!okA || !okB) {
        const msg = (!okA && !okB)
          ? `Both numbers need checking — expected <strong>${this.esc(step.aA.s)}</strong> and <strong>${this.esc(step.aB.s)}</strong>.`
          : (!okA ? `The first number needs checking — expected <strong>${this.esc(step.aA.s)}</strong>.`
                  : `The second number needs checking — expected <strong>${this.esc(step.aB.s)}</strong>.`);
        fb.innerHTML = `<div class="calc-fb fb-wrong">❌ ${msg}</div>`;
        return;
      }

      inputs.forEach(i => i.disabled = true);
      checkBtn.disabled = true;

      fb.innerHTML = `
        <div class="calc-fb fb-ok" style="margin-top:8px">✅ <strong>Good work!</strong> Here is a model response:</div>
        <div class="calc-fb fb-info" style="margin-top:5px">
          📘 <em>"I need to ${this.esc(step.verb)} ${this.esc(step.aA.s)} ${this.esc(step.prep)} ${this.esc(step.aB.s)} because ${this.esc(step.reason)}."</em>
        </div>
      `;
      this.advanceToNextCard(card);
    };

    checkBtn.addEventListener('click', handleCheck);
    inputs.forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') handleCheck(); }));

    return card;
  },

  createCalcCard: function(data) {
    const { step, calcIdx } = data;
    const card = document.createElement('div');
    card.className = 'calc-step-card';

    card.innerHTML = `
      <div class="calc-step-hd">
        <div class="calc-step-num">${this.currentCardIndex + 1}</div>
        <div class="calc-step-ttl">What answer do you get?</div>
        <div class="calc-step-icon"></div>
      </div>
      <div class="calc-step-bd">
        <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:13px">Calculate and enter your answer.</p>
        <div class="calc-ans-row">
          <input class="calc-ans-input" type="text" placeholder="Your answer…" autocomplete="off" spellcheck="false">
        </div>
        <div class="calc-btn-row">
          <button class="calc-btn btn-primary chk-btn">Check ➜</button>
          <span class="calc-attempts-msg"></span>
        </div>
        <div class="calc-fb-container"></div>
      </div>
    `;

    const inp = card.querySelector('.calc-ans-input');
    const checkBtn = card.querySelector('.chk-btn');
    const fb = card.querySelector('.calc-fb-container');
    const attMsg = card.querySelector('.calc-attempts-msg');

    // UX Update: Only auto-focus on desktop devices to prevent mobile keyboard from hijacking the screen
    if (window.innerWidth > 768) {
      setTimeout(() => inp.focus(), 60);
    }

    // Track total calculations required globally
    this.calcStats.total++;
    const currentQRes = this.qResults[this.qIndex];
    currentQRes.calcsTotal++;

    const handleCheck = () => {
      const val = inp.value;
      const ok = this.numEq(val, step.ans, false);
      this.cardAttempts++;

      if (ok) {
        inp.disabled = true; 
        inp.classList.add('b-ok');
        checkBtn.disabled = true;

        if (this.cardAttempts === 1) {
          this.calcStats.firstTry++;
          currentQRes.calcsFirstTry++;
        }

        fb.innerHTML = `
          <div class="calc-fb fb-ok" style="margin-top:8px">✅ <strong>Correct!</strong> Well done.</div>
          <div class="calc-fb fb-info" style="margin-top:5px">📘 Working: <span class="calc-math-line">\\(${step.latex}\\)</span></div>
        `;
        this.typeset(fb);
        this.advanceToNextCard(card);

      } else if (this.cardAttempts >= 3) {
        inp.disabled = true; 
        inp.classList.add('b-err');
        checkBtn.disabled = true;
        
        fb.innerHTML = `
          <div class="calc-fb fb-wrong" style="margin-top:8px">❌ Not quite — here is the answer:</div>
          <div class="calc-fb fb-info" style="margin-top:5px">📘 Working: <span class="calc-math-line">\\(${step.latex}\\)</span></div>
        `;
        this.typeset(fb);
        this.advanceToNextCard(card);

      } else {
        const left = 3 - this.cardAttempts;
        attMsg.textContent = `${left} attempt${left > 1 ? 's' : ''} left`;
        fb.innerHTML = `<div class="calc-fb fb-wrong" style="margin-top:8px">❌ Not quite — try again.</div>`;
      }
    };

    checkBtn.addEventListener('click', handleCheck);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') handleCheck(); });

    return card;
  },

  createMeaningCard: function(data) {
    const { q } = data;
    const card = document.createElement('div');
    card.className = 'calc-step-card';

    card.innerHTML = `
      <div class="calc-step-hd">
        <div class="calc-step-num">${this.currentCardIndex + 1}</div>
        <div class="calc-step-ttl">What does the final answer mean?</div>
        <div class="calc-step-icon"></div>
      </div>
      <div class="calc-step-bd">
        <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:12px">
          Explain what your final answer (${this.esc(q.finalAnsDisp)}) means in the real-world context of the problem.
        </p>
        <div class="calc-meaning-row">
          <span style="white-space:nowrap;font-weight:600">"This means that</span>
          <input class="calc-meaning-input" type="text" placeholder="complete the sentence…" autocomplete="off">
          <span style="white-space:nowrap;font-weight:600">."</span>
        </div>
        <div class="calc-btn-row">
          <button class="calc-btn btn-primary chk-btn">Submit ➜</button>
        </div>
        <div class="calc-fb-container"></div>
      </div>
    `;

    const inp = card.querySelector('.calc-meaning-input');
    const checkBtn = card.querySelector('.chk-btn');
    const fb = card.querySelector('.calc-fb-container');

    // UX Update: Only auto-focus on desktop devices to prevent mobile keyboard from hijacking the screen
    if (window.innerWidth > 768) {
      setTimeout(() => inp.focus(), 60);
    }

    const handleSubmit = () => {
      if (inp.value.trim().length < 8) {
        fb.innerHTML = '<div class="calc-fb fb-wrong">❌ Please write a complete sentence.</div>';
        return;
      }

      inp.disabled = true;
      checkBtn.disabled = true;

      fb.innerHTML = `
        <div class="calc-fb fb-reveal" style="margin-top:8px">
          📋 <strong>Here is how we would express that:</strong><br><br>
          <em style="font-size:1rem">"This means that ${this.esc(q.meaning)}"</em>
        </div>
      `;
      this.advanceToNextCard(card);
    };

    checkBtn.addEventListener('click', handleSubmit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') handleSubmit(); });

    return card;
  },

  // --- Summary ---
  showSummary: function() {
    document.getElementById('calc-frozen-pane').style.display = 'none';
    document.getElementById('calc-scroll-pane').style.display = 'none';

    let summaryEl = document.getElementById('calc-summary');
    if (!summaryEl) {
      // Create if it doesn't exist, though index.html already provides it.
      summaryEl = document.createElement('div');
      summaryEl.id = 'calc-summary';
      summaryEl.className = 'content-card';
      document.getElementById('calculate-area').appendChild(summaryEl);
    }
    
    const percentage = this.calcStats.total === 0 ? 0 : (this.calcStats.firstTry / this.calcStats.total);
    const emoji = percentage >= 0.9 ? '🌟' : percentage >= 0.7 ? '⭐' : percentage >= 0.5 ? '👍' : '💪';
    const msg = percentage >= 0.9 ? 'Outstanding work!'
              : percentage >= 0.7 ? 'Great work!'
              : percentage >= 0.5 ? 'Good effort!'
              : "Keep practising — you'll get there!";

    const rows = this.qResults.map(res => {
      const isPerfect = res.calcsFirstTry === res.calcsTotal;
      const ic = isPerfect ? '✅' : (res.calcsFirstTry > 0 ? '⚠️' : '❌');
      return `
        <tr>
          <td>${res.id}</td>
          <td>${this.esc(res.title)}</td>
          <td style="text-align:center">${res.calcsFirstTry} / ${res.calcsTotal}</td>
          <td style="text-align:center">${ic}</td>
        </tr>
      `;
    }).join('');

    summaryEl.style.display = 'block';
    summaryEl.innerHTML = `
      <div style="font-size:2.8rem;margin-bottom:8px">${emoji}</div>
      <h2>${msg}</h2>
      <div class="calc-score-big">${this.calcStats.firstTry} / ${this.calcStats.total}</div>
      <div class="calc-score-sub">calculation steps correct on the first attempt</div>
      <table class="calc-sum-table">
        <thead><tr><th>Q#</th><th>Topic</th><th>Calcs Correct</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="calc-btn btn-action" id="calc-restartBtn" style="margin-top: 1.5rem;">↩ Return to Overview</button>
    `;

    const badge = document.getElementById('calc-q-badge');
    if(badge) {
      badge.textContent = 'Complete!';
    }
    document.getElementById('calc-prog-bar').style.width = '100%';
    
    // UX Update: Smart scroll to the summary offset, rather than absolute window top
    if (summaryEl) {
      const y = summaryEl.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: y, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    document.getElementById('calc-restartBtn').addEventListener('click', () => {
      // Instead of hard reloading the page, send user back to the global overview
      if(window.showView) window.showView('global-home-screen');
    });
  }
};
