// ===== Разделы теста =====
const SECTIONS = {
  basics: {
    title: 'Основы маркетинга',
    description: 'Термины, практика и задачи с расчётами.',
    file: 'questions.json',
    plan: { A: 3, B: 3, C: 4 }, // сколько вопросов каждого уровня в тесте
    total: 10,
    levelNames: { A: 'Термины', B: 'Практика', C: 'Задачи' },
    levelPrefix: ''
  },
  course: {
    title: 'Курс: модули 1–8',
    description: 'Вопросы по всем модулям курса: от мышления до онлайн-маркетинга.',
    file: 'questions2.json',
    plan: null, // без деления на уровни: 10 случайных из всех вопросов
    total: 10,
    levelNames: {
      '1': 'Мышление',
      '2': 'Дорожная карта маркетолога',
      '3': 'План работ',
      '4': 'Начало работы с проектом',
      '5': 'Теория маркетинга',
      '6': 'Команда',
      '7': 'Оффлайн-маркетинг',
      '8': 'Онлайн-маркетинг'
    },
    levelPrefix: 'Модуль '
  }
};

const MODE_TEXT = {
  test: '10 случайных вопросов, в конце — результат.',
  train: 'Выберите тему и отвечайте без ограничения по числу вопросов. Завершить можно в любой момент.'
};

// ===== Подключение к Telegram =====
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const $ = (id) => document.getElementById(id);

let currentSection = 'basics';
let mode = 'test'; // 'test' — тест из 10 вопросов, 'train' — тренировка по теме
let currentTopic = 'all';
const cache = {}; // загруженные вопросы по разделам

let quiz = [];
let current = 0;
let score = 0;
let answeredCount = 0;
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

function levelLabel(section, level) {
  const name = section.levelNames[level] || '';
  return section.levelPrefix + level + (name ? ' · ' + name : '');
}

// ===== Стартовый экран =====
function updateStartUI() {
  document.querySelectorAll('.mode').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  $('topic-box').classList.toggle('hidden', mode !== 'train');
  $('mode-desc').textContent = MODE_TEXT[mode];
  $('btn-start').textContent = mode === 'train' ? 'Начать тренировку' : 'Начать тест';
}

function setMode(m) {
  mode = m;
  updateStartUI();
}

// Список тем для тренировки (модули или уровни)
function buildTopics() {
  const section = SECTIONS[currentSection];
  const all = cache[currentSection] || [];
  const select = $('topic-select');
  select.innerHTML = '';

  const addOption = (value, label) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    select.appendChild(o);
  };

  addOption('all', 'Все темы (' + all.length + ')');
  Object.keys(section.levelNames).forEach((level) => {
    const n = all.filter((q) => q.level === level).length;
    if (n > 0) addOption(level, levelLabel(section, level) + ' (' + n + ')');
  });
  select.value = 'all';
}

// ===== Выбор раздела =====
async function selectSection(key) {
  currentSection = key;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.section === key);
  });

  const section = SECTIONS[key];
  const desc = $('section-desc');
  desc.textContent = section.description;
  $('btn-start').disabled = true;
  updateStartUI();

  try {
    if (!cache[key]) {
      const response = await fetch(section.file, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      cache[key] = await response.json();
    }
    if (currentSection !== key) return; // пользователь уже переключился на другой раздел
    desc.textContent = section.description + ' Всего вопросов в банке: ' + cache[key].length + '.';
    buildTopics();
    $('btn-start').disabled = false;
  } catch (e) {
    if (currentSection !== key) return;
    desc.textContent =
      'Не удалось загрузить вопросы (файл ' + section.file + '). Проверьте, что файл загружен в репозиторий.';
  }
}

// ===== Выбор случайных вопросов для теста =====
function pickQuestions(section, all) {
  // Раздел без плана: просто 10 случайных вопросов из всего банка
  if (!section.plan) {
    return shuffle(all).slice(0, section.total);
  }

  let picked = [];
  Object.keys(section.plan).forEach((level) => {
    const pool = shuffle(all.filter((q) => q.level === level));
    picked = picked.concat(pool.slice(0, section.plan[level]));
  });

  // Если вопросов какого-то уровня не хватило, добираем из остальных
  if (picked.length < section.total) {
    const usedIds = new Set(picked.map((q) => q.id));
    const rest = shuffle(all.filter((q) => !usedIds.has(q.id)));
    picked = picked.concat(rest.slice(0, section.total - picked.length));
  }

  return shuffle(picked);
}

// ===== Запуск теста или тренировки =====
function startQuiz() {
  const section = SECTIONS[currentSection];
  const all = cache[currentSection];
  if (!all || all.length === 0) return;

  if (mode === 'train') {
    currentTopic = $('topic-select').value || 'all';
    // все вопросы выбранной темы в случайном порядке
    quiz = shuffle(all.filter((q) => currentTopic === 'all' || q.level === currentTopic));
  } else {
    currentTopic = 'all';
    quiz = pickQuestions(section, all);
  }
  if (quiz.length === 0) return;

  current = 0;
  score = 0;
  answeredCount = 0;
  stats = {};
  Object.keys(section.levelNames).forEach((l) => { stats[l] = { right: 0, total: 0 }; });

  $('btn-finish').classList.toggle('hidden', mode !== 'train');
  showScreen('quiz-screen');
  showQuestion();
}

// ===== Показ вопроса =====
function showQuestion() {
  const section = SECTIONS[currentSection];
  const q = quiz[current];
  answered = false;

  $('progress').textContent = 'Вопрос ' + (current + 1) + ' из ' + quiz.length;
  $('progress-fill').style.width = (current / quiz.length) * 100 + '%';
  $('level-badge').textContent = levelLabel(section, q.level);
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

// ===== Ответ на числовую задачу (если такие вопросы появятся) =====
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
  answeredCount++;
  const q = quiz[current];

  if (!stats[q.level]) stats[q.level] = { right: 0, total: 0 };
  stats[q.level].total++;
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
  const section = SECTIONS[currentSection];
  const total = answeredCount;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  let title = section.title;
  if (mode === 'train') {
    title += ' · тренировка';
    if (currentTopic !== 'all') title += ' · ' + levelLabel(section, currentTopic);
  }
  $('result-section').textContent = title;
  $('result-score').textContent = score + ' из ' + total + ' — ' + percent + '%';

  const box = $('result-levels');
  box.innerHTML = '';
  Object.keys(stats).forEach((level) => {
    if (stats[level].total === 0) return;
    const row = document.createElement('div');
    row.className = 'level-row';

    const name = document.createElement('span');
    const levelName = section.levelNames[level] || '';
    name.textContent = section.levelPrefix + level + (levelName ? ' — ' + levelName : '');

    const value = document.createElement('strong');
    value.textContent = stats[level].right + ' из ' + stats[level].total;

    row.appendChild(name);
    row.appendChild(value);
    box.appendChild(row);
  });

  showScreen('result-screen');
}

// ===== Кнопки =====
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => selectSection(tab.dataset.section));
});
document.querySelectorAll('.mode').forEach((b) => {
  b.addEventListener('click', () => setMode(b.dataset.mode));
});

$('btn-start').addEventListener('click', startQuiz);
$('btn-restart').addEventListener('click', startQuiz);
$('btn-change').addEventListener('click', () => showScreen('start-screen'));
$('btn-finish').addEventListener('click', () => {
  if (answeredCount === 0) {
    showScreen('start-screen');
  } else {
    showResult();
  }
});
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

// ===== Старт приложения =====
selectSection('basics');
