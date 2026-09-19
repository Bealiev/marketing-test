// ===== Настройки =====
const TEST_PLAN = { A: 3, B: 3, C: 4 }; // сколько вопросов каждого уровня
const LEVEL_NAMES = { A: 'Термины', B: 'Практика', C: 'Задачи' };

// ===== Подключение к Telegram =====
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const $ = (id) => document.getElementById(id);

let allQuestions = [];
let quiz = [];
let current = 0;
let score = 0;
let stats = {};
let answered = false;

// ===== Вспомогательные функции =====
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showScreen(id) {
  ['start-screen', 'quiz-screen', 'result-screen'].forEach((s) => $(s).classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo(0, 0);
}

// ===== Выбор случайных вопросов =====
function pickQuestions() {
  const total = Object.values(TEST_PLAN).reduce((a, b) => a + b, 0);
  let picked = [];

  Object.keys(TEST_PLAN).forEach((level) => {
    const pool = shuffle(allQuestions.filter((q) => q.level === level));
    picked = picked.concat(pool.slice(0, TEST_PLAN[level]));
  });

  // Если вопросов какого-то уровня не хватило, добираем из остальных
  if (picked.length < total) {
    const usedIds = new Set(picked.map((q) => q.id));
    const rest = shuffle(allQuestions.filter((q) => !usedIds.has(q.id)));
    picked = picked.concat(rest.slice(0, total - picked.length));
  }

  return shuffle(picked);
}

// ===== Запуск теста =====
function startQuiz() {
  quiz = pickQuestions();
  current = 0;
  score = 0;
  stats = {};
  Object.keys(TEST_PLAN).forEach((l) => { stats[l] = { right: 0, total: 0 }; });
  quiz.forEach((q) => {
    if (!stats[q.level]) stats[q.level] = { right: 0, total: 0 };
    stats[q.level].total++;
  });
  showScreen('quiz-screen');
  showQuestion();
}

// ===== Показ вопроса =====
function showQuestion() {
  const q = quiz[current];
  answered = false;

  $('progress').textContent = 'Вопрос ' + (current + 1) + ' из ' + quiz.length;
  $('progress-fill').style.width = (current / quiz.length) * 100 + '%';
  $('level-badge').textContent = q.level + ' · ' + (LEVEL_NAMES[q.level] || '');
  $('question-text').textContent = q.question;

  $('feedback').className = 'hidden';
  $('btn-next').classList.add('hidden');

  const box = $('answers');
  box.innerHTML = '';

  if (q.type === 'number') {
    $('number-box').classList.remove('hidden');
    $('number-input').value = '';
    $('number-input').disabled = false;
    $('btn-submit').disabled = false;
  } else {
    $('number-box').classList.add('hidden');

    // перемешиваем варианты ответов
    const options = shuffle(
      q.answers.map((text, i) => ({ text: text, isCorrect: i === q.correct }))
    );

    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'answer-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => {
        if (answered) return;
        const buttons = box.querySelectorAll('.answer-btn');
        buttons.forEach((b, idx) => {
          b.disabled = true;
          if (options[idx].isCorrect) b.classList.add('correct');
        });
        if (!opt.isCorrect) btn.classList.add('wrong');
        const correctText = options.find((o) => o.isCorrect).text;
        registerAnswer(opt.isCorrect, correctText);
      });
      box.appendChild(btn);
    });
  }
}

// ===== Ответ на числовую задачу =====
function submitNumber() {
  if (answered) return;
  const q = quiz[current];
  const raw = $('number-input').value.trim().replace(/\s/g, '').replace(',', '.');
  const value = Number(raw);

  if (raw === '' || Number.isNaN(value)) {
    const fb = $('feedback');
    fb.textContent = 'Введите число цифрами, например 500';
    fb.className = 'hint';
    return;
  }

  const ok = Math.abs(value - q.answer) < 0.01;
  $('number-input').disabled = true;
  $('btn-submit').disabled = true;
  registerAnswer(ok, q.answer.toLocaleString('ru-RU'));
}

// ===== Запись результата ответа =====
function registerAnswer(isCorrect, correctText) {
  answered = true;
  const q = quiz[current];

  if (isCorrect) {
    score++;
    stats[q.level].right++;
  }

  const fb = $('feedback');
  fb.textContent = isCorrect ? '✅ Верно!' : '❌ Неверно. Правильный ответ: ' + correctText;
  fb.className = isCorrect ? 'correct' : 'wrong';

  $('progress-fill').style.width = ((current + 1) / quiz.length) * 100 + '%';
  $('btn-next').textContent = current === quiz.length - 1 ? 'Показать результат' : 'Дальше';
  $('btn-next').classList.remove('hidden');
}

// ===== Экран результата =====
function showResult() {
  const total = quiz.length;
  const percent = Math.round((score / total) * 100);
  $('result-score').textContent = score + ' из ' + total + ' — ' + percent + '%';

  const box = $('result-levels');
  box.innerHTML = '';
  Object.keys(stats).forEach((level) => {
    if (stats[level].total === 0) return;
    const row = document.createElement('div');
    row.className = 'level-row';

    const name = document.createElement('span');
    name.textContent = level + ' — ' + (LEVEL_NAMES[level] || '');

    const value = document.createElement('strong');
    value.textContent = stats[level].right + ' из ' + stats[level].total;

    row.appendChild(name);
    row.appendChild(value);
    box.appendChild(row);
  });

  showScreen('result-screen');
}

// ===== Кнопки =====
$('btn-start').addEventListener('click', startQuiz);
$('btn-restart').addEventListener('click', startQuiz);
$('btn-submit').addEventListener('click', submitNumber);
$('number-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitNumber();
});
$('btn-next').addEventListener('click', () => {
  if (current >= quiz.length - 1) {
    showResult();
  } else {
    current++;
    showQuestion();
  }
});

// ===== Загрузка вопросов =====
async function loadQuestions() {
  $('btn-start').disabled = true;
  try {
    const response = await fetch('questions.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    allQuestions = await response.json();
    $('btn-start').disabled = false;
  } catch (e) {
    document.querySelector('#start-screen .subtitle').textContent =
      'Не удалось загрузить вопросы. Проверьте файл questions.json.';
  }
}

loadQuestions();
