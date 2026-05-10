/**
 * Numme - Explain Module Framework
 * Handles question loading, stand detection, feedback, and scoring for the Explain section.
 */
const ExplainModule = {
  cfg: null,
  questions: [],
  currentQ: null,
  currentLvl: null,
  lastQId: null,
  detectedStd: null,
  levelNames: { 1: 'Scaffolded', 2: 'Standard', 3: 'Rates & Measures', 4: 'Complex' },

  init: function() {
    this.cfg = typeof EXPLAIN_QA !== 'undefined' ? EXPLAIN_QA.config : null;
    this.questions = typeof EXPLAIN_QA !== 'undefined' ? EXPLAIN_QA.questions : [];

    this.updateCounts();
    this.bindEvents();
  },

  bindEvents: function() {
    const self = this;

    /* ── Level selection ────────────────────────────────────── */
    $(document).on('click', '.level-tab', function (e) { 
      e.preventDefault();
      self.selectLevel($(this).data('level')); 
    });
    
    // Scoped to #welcome-level-cards so it doesn't hijack Calculate module clicks
    $(document).on('click keypress', '#welcome-level-cards .level-card', function (e) {
      if (e.type === 'click' || e.key === 'Enter') self.selectLevel($(this).data('level'));
    });

    /* ── Submit Answer ──────────────────────────────────────── */
    $('#submit-btn').on('click', () => self.handleSubmit());
    $('#stand-input').on('keydown', function (e) { 
      if (e.key === 'Enter') self.handleSubmit(); 
    });

    /* ── Score Button ───────────────────────────────────────── */
    $('#score-btn').on('click', function () {
      self.calculateScore(this);
    });

    /* ── Internal module navigation ─────────────────────────── */
    $('#retry-question-btn').on('click', function () {
      self.renderQuestion(self.currentQ);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    $('#next-question-btn').on('click', () => self.loadRandomQuestion());

    $('#back-to-explain-btn').on('click', function () {
      self.currentLvl = null;
      self.currentQ   = null;
      if (window.showView) window.showView('explain-overview-screen');
    });
  },

  updateCounts: function() {
    if (this.questions && this.questions.length > 0) {
      for (let i = 1; i <= 4; i++) {
        const n = this.questions.filter(q => q.level === i).length;
        $('#count-l' + i).text(n + ' question' + (n !== 1 ? 's' : ''));
      }
    }
  },

  selectLevel: function(lvl) {
    this.currentLvl = +lvl;
    if (window.showView) window.showView('question-area');
    this.loadRandomQuestion();
  },

  loadRandomQuestion: function() {
    if (!this.questions || this.questions.length === 0) {
       $('#q-context').text("Question data could not be loaded. Ensure explain_qa.js is present.");
       return;
    }
    const pool = this.questions.filter(q => q.level === this.currentLvl);
    if (!pool.length) { alert('No questions available for this level yet.'); return; }
    
    const avail = pool.filter(q => q.id !== this.lastQId);
    const src   = avail.length ? avail : pool;
    this.currentQ = src[Math.floor(Math.random() * src.length)];
    this.lastQId  = this.currentQ.id;
    
    this.renderQuestion(this.currentQ);
  },

  renderQuestion: function(q) {
    // Meta
    $('#q-level-badge').text('Level ' + q.level).attr('class', 'level-badge l' + q.level);
    $('#q-topic').text(q.topic);
    $('#q-source').text(q.source || '');
    $('#q-id-display').text('Q-ID: ' + q.id);

    // Content
    $('#q-context').text(q.context);
    this.renderData(q.data);
    $('#q-claim').text(q.claim);
    $('#q-instruction').text(q.question);

    // Scaffold
    if (q.level === 1 && q.scaffold) {
      $('#scaffold-hint').html('<strong>💡 Hint:</strong> ' + this.esc(q.scaffold.hint));
      $('#scaffold-sentence').html('<strong>Sentence starter:</strong> ' + this.esc(q.scaffold.sentence_starter));
      $('#scaffold-card').removeAttr('hidden');
      // Pre-fill calculation template
      if (q.scaffold.calculation_prompt) {
        $('#justification-input')
          .val(q.scaffold.calculation_prompt)
          .css('font-family', "'Courier New', monospace");
      } else {
        $('#justification-input').val('').css('font-family', 'inherit');
      }
    } else {
      $('#scaffold-card').attr('hidden', true);
      $('#justification-input').val('').css('font-family', 'inherit');
    }

    // Reset inputs & errors
    $('#stand-input').val('').removeClass('unrecognized');
    $('#stand-error-text').attr('hidden', true).text('');
    this.detectedStd = null;

    // Show/hide panels within question view
    $('#feedback-area').attr('hidden', true);
    $('#answer-card').removeAttr('hidden');

    // MathJax re-typeset
    if (window.MathJax) MathJax.typesetPromise(['#question-area']);
  },

  renderData: function(data) {
    const $c = $('#q-data').empty();
    if (!data) return;

    if (data.type === 'text') {
      $c.append($('<div class="data-text"></div>').text(data.content));
    } else if (data.type === 'table') {
      const $w = $('<div class="data-table-wrap"></div>');
      if (data.caption) $w.append($('<div class="data-table-caption"></div>').text(data.caption));
      
      const $t = $('<table class="data-table"></table>');
      const $th = $('<thead><tr></tr></thead>');
      data.headers.forEach(h => $th.find('tr').append($('<th></th>').text(h)));
      $t.append($th);
      
      const $tb = $('<tbody></tbody>');
      data.rows.forEach(row => {
        const $r = $('<tr></tr>');
        row.forEach(cell => $r.append($('<td></td>').text(cell)));
        $tb.append($r);
      });
      $t.append($tb);
      $w.append($t);
      
      if (data.notes) $w.append($('<div class="data-table-notes"></div>').text('Note: ' + data.notes));
      $c.append($w);
    }
  },

  detectStand: function(input) {
    const s = input.trim().toLowerCase();
    if (!s) return null;
    
    const match = (opts, result) => {
      for (const opt of opts) {
        const o = opt.toLowerCase();
        if (s === o ||
            s.startsWith(o + ' ') || s.startsWith(o + ',') ||
            s.startsWith(o + '.') || s.startsWith(o + ':') ||
            s.startsWith(o + '!')) return result;
      }
      return null;
    };
    
    return match(this.currentQ.stand_options.positive, 'agree') ||
           match(this.currentQ.stand_options.negative, 'disagree') ||
           null;
  },

  handleSubmit: function() {
    const raw = $('#stand-input').val().trim();
    if (!raw) {
      this.showStandError('Please type your position first — use a word like yes, no, agree, disagree, right, wrong, true, or false.');
      return;
    }
    
    const det = this.detectStand(raw);
    if (!det) {
      this.showStandError('We couldn\'t recognise "' + raw + '" as a clear position. Try starting with: yes, no, agree, disagree, right, wrong, true, or false.');
      $('#stand-input').addClass('unrecognized');
      return;
    }
    
    $('#stand-error-text').attr('hidden', true);
    $('#stand-input').removeClass('unrecognized');
    this.detectedStd = det;
    this.showFeedback();
  },

  showStandError: function(msg) {
    $('#stand-error-text').text(msg).removeAttr('hidden');
    $('#stand-input').addClass('unrecognized').focus();
  },

  showFeedback: function() {
    const q   = this.currentQ;
    const std = this.detectedStd;

    // Record student's raw answer for display
    const rawStand  = $('#stand-input').val().trim();
    const rawJust   = $('#justification-input').val().trim();
    const stdLabel  = std === 'agree' ? 'AGREE / YES / RIGHT' : 'DISAGREE / NO / WRONG';

    $('#your-stand-display').text(rawStand);
    $('#your-stand-recognised').text(stdLabel);
    if (rawJust) {
      $('#your-justification-display').text(rawJust).removeAttr('hidden');
    } else {
      $('#your-justification-display').text('(nothing written)');
    }

    // Determine if wrong stand
    const isWrong = !q.both_stands_valid && q.valid_stand &&
                    ((q.valid_stand === 'positive' && std === 'disagree') ||
                     (q.valid_stand === 'negative' && std === 'agree'));

    if (isWrong) {
      const correctLabel = q.valid_stand === 'positive' ? 'AGREE / YES / RIGHT' : 'DISAGREE / NO / WRONG';
      $('#wrong-stand-title').text('⚠️ Your stand is not supported by the data');
      $('#wrong-stand-body').text(
        'The calculation shows the correct answer is: ' + correctLabel +
        '. Review both model answers below to see why.'
      );
      $('#wrong-stand-warning').removeAttr('hidden');
    } else {
      $('#wrong-stand-warning').attr('hidden', true);
    }

    // Build model answers
    const $mc = $('#model-answers-container').empty();
    if (isWrong) {
      const wrongAns   = q.model_answers[std];
      const correctKey = q.valid_stand === 'positive' ? 'agree' : 'disagree';
      const correctAns = q.model_answers[correctKey];
      
      $mc.append(this.buildModelAnswer(wrongAns, true, 'Your chosen stand (not supported by the data):'));
      $mc.append(this.buildModelAnswer(correctAns, false, 'Correct model answer:'));
      this.buildChecklist(correctAns);
    } else {
      const ans = q.model_answers[std];
      $mc.append(this.buildModelAnswer(ans, false, 'Model answer for your position:'));
      this.buildChecklist(ans);
    }

    // Show feedback panel
    $('#answer-card').attr('hidden', true);
    $('#verdict-section').attr('hidden', true);
    $('#feedback-area').removeAttr('hidden');

    if (window.MathJax) MathJax.typesetPromise(['#feedback-area']);

    setTimeout(() => {
      document.getElementById('feedback-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  },

  buildModelAnswer: function(ans, isInvalid, headerText) {
    const $card = $('<div></div>').addClass('model-answer-card' + (isInvalid ? ' invalid' : ''));
    $card.append($('<div class="model-answer-header"></div>').text(headerText));
    $card.append($('<div class="model-answer-stand"></div>').text('Stand: ' + ans.stand));
    
    const $steps = $('<div class="calc-steps"></div>');
    ans.calculation_steps.forEach(s => $steps.append($('<div class="calc-step"></div>').text(s)));
    $card.append($steps);
    
    $card.append($('<div class="result-line"></div>').text('Result: ' + ans.result));
    $card.append($('<div class="model-answer-explanation"></div>').text(ans.explanation));
    return $card;
  },

  buildChecklist: function(ans) {
    if (!this.cfg || !this.cfg.checklist_items) return;
    const $c = $('#checklist-items').empty();
    
    this.cfg.checklist_items.forEach(item => {
      const evidence = ans.evidence_checklist[item.id] || '';
      const $item = $('<div class="checklist-item"></div>');
      const $cb   = $('<input type="checkbox" class="checklist-checkbox">').attr('id', 'chk-' + item.id).attr('data-id', item.id);
      const $content = $('<div class="checklist-item-content"></div>');
      
      $content.append($('<label class="checklist-item-label"></label>').attr('for', 'chk-' + item.id).text(item.label));
      $content.append($('<div class="checklist-item-evidence"></div>').text(evidence));
      $item.append($cb).append($content);
      $c.append($item);
    });
    
    // Reset state
    $('.checklist-checkbox').prop('checked', false).prop('disabled', false);
    $('#score-btn').prop('disabled', false);
    $('#verdict-section').attr('hidden', true);
  },

  calculateScore: function(btnElement) {
    const score    = $('.checklist-checkbox:checked').length;
    const c1ticked = $('#chk-c1').is(':checked');
    const c3ticked = $('#chk-c3').is(':checked');

    // Lock checklist
    $('.checklist-checkbox').prop('disabled', true);
    $(btnElement).prop('disabled', true);

    // Find verdict
    const verdict = this.cfg.verdict_thresholds.find(v => score >= v.min_score && score <= v.max_score)
                    || this.cfg.verdict_thresholds[this.cfg.verdict_thresholds.length - 1];

    // Verdict card
    $('#verdict-card').attr('class', 'verdict-card ' + verdict.colour);
    $('#verdict-score').text(score);
    $('#verdict-label').text(verdict.label);

    // Failure modes
    const $fm = $('#failure-modes-container').empty();
    if (!c1ticked) $fm.append($('<div class="failure-mode-msg"></div>').text(this.cfg.failure_modes.no_position.message));
    if (!c3ticked) $fm.append($('<div class="failure-mode-msg"></div>').text(this.cfg.failure_modes.estimation_only.message));

    // Show verdict
    $('#verdict-section').removeAttr('hidden');
    setTimeout(() => {
      document.getElementById('verdict-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  },

  esc: function(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
