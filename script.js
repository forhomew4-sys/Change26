// --- 1. TELEGRAM WEBAPP INTEGRATION ---
const tg = window.Telegram?.WebApp;
const telegramUser = tg?.initDataUnsafe?.user;

function notifySuccess() {
  if (tg?.isVersionAtLeast?.("6.1")) {
    tg.HapticFeedback.notificationOccurred("success");
  }
}

if (tg) {
  tg.ready();
  tg.expand();
  if (tg.isVersionAtLeast?.("6.1")) {
    tg.setHeaderColor("#080b12");
    tg.setBackgroundColor("#080b12");
  }

  if (telegramUser) {
    document.getElementById("u-name").textContent =
      [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ") || "Player";
    document.getElementById("u-id").textContent = telegramUser.username
      ? `@${telegramUser.username}`
      : `ID: ${telegramUser.id}`;
    document.getElementById("avatar").textContent =
      (telegramUser.first_name || "U").charAt(0).toUpperCase();
  }
}

// --- 2. COINS / POINTS PERSISTENCE ---
const playerKey = telegramUser?.id ?? "guest";
const coinsStorageKey = `mahin6_coins_${playerKey}`;
const pendingCoinsStorageKey = `mahin6_pending_coins_${playerKey}`;
const lifetimeCoinsStorageKey = `mahin6_lifetime_coins_${playerKey}`;
const adCooldownStorageKey = `mahin6_ad_cooldown_${playerKey}`;
const previousCoinsStorageKey = `mahinx_coins_${playerKey}`;
const previousPendingCoinsStorageKey = `mahinx_pending_coins_${playerKey}`;
const storedCoins = localStorage.getItem(coinsStorageKey) ??
  localStorage.getItem(previousCoinsStorageKey) ?? "100";
const storedPendingCoins = localStorage.getItem(pendingCoinsStorageKey) ??
  localStorage.getItem(previousPendingCoinsStorageKey) ?? "0";
let coins = Number.parseInt(storedCoins, 10);
if (!Number.isSafeInteger(coins) || coins < 0) coins = 100;
let pendingCoins = Number.parseInt(storedPendingCoins, 10);
if (!Number.isSafeInteger(pendingCoins) || pendingCoins < 0) pendingCoins = 0;
const storedLifetimeCoins = Number.parseInt(
  localStorage.getItem(lifetimeCoinsStorageKey) ?? "0",
  10
);
let lifetimeCoins = Number.isSafeInteger(storedLifetimeCoins) && storedLifetimeCoins >= 0
  ? storedLifetimeCoins
  : 0;
localStorage.setItem(coinsStorageKey, String(coins));
localStorage.setItem(pendingCoinsStorageKey, String(pendingCoins));

const SUPABASE_URL = "https://dtnvtywwhygwoktsuxev.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lv9A_1o4t_BYrACN4oJ_9w_gMpnIrWW";
const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
let renderWithdrawalEstimate = () => {};

function renderCoinBalances() {
  document.getElementById("coin-txt").textContent = String(coins);
  document.getElementById("wallet-coins").textContent = String(coins);
  document.getElementById("profile-coins").textContent = String(coins);
}

async function syncLeaderboard() {
  if (!supabaseClient || !telegramUser) return;
  const { error } = await supabaseClient.from("leaderboard").upsert({
    telegram_id: telegramUser.id,
    username: telegramUser.username ?? null,
    display_name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ") || "Player",
    lifetime_coins: lifetimeCoins,
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.error("Leaderboard update failed:", error);
    document.getElementById("leaderboard-status").textContent =
      "Leaderboard sync হয়নি। Supabase setup ও connection যাচাই করুন।";
  }
}

function updateCoins(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0 ||
      !Number.isSafeInteger(coins + amount) ||
      !Number.isSafeInteger(lifetimeCoins + amount)) {
    return false;
  }
  coins += amount;
  lifetimeCoins += amount;
  localStorage.setItem(coinsStorageKey, String(coins));
  localStorage.setItem(lifetimeCoinsStorageKey, String(lifetimeCoins));
  renderCoinBalances();
  renderWithdrawalEstimate();
  syncLeaderboard().catch((err) => {
    console.error("Leaderboard update failed:", err);
  });
  return true;
}

function updatePendingCoins(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0 ||
      !Number.isSafeInteger(pendingCoins + amount)) return;
  pendingCoins += amount;
  localStorage.setItem(pendingCoinsStorageKey, String(pendingCoins));
  renderPendingReward();
}

function renderPendingReward() {
  const claimButton = document.getElementById("claim-reward");
  document.getElementById("pending-coins").textContent = String(pendingCoins);
  claimButton.hidden = pendingCoins === 0;
  claimButton.textContent = `Claim game reward (${pendingCoins} coins)`;
}

document.getElementById("claim-reward").addEventListener("click", () => {
  if (pendingCoins === 0 || !updateCoins(pendingCoins)) return;
  pendingCoins = 0;
  localStorage.setItem(pendingCoinsStorageKey, "0");
  renderPendingReward();
  document.getElementById("wallet-status").textContent = "গেমের কয়েন আপনার balance-এ যোগ হয়েছে।";
  notifySuccess();
});

renderCoinBalances();
renderPendingReward();

// --- 3. ADSGRAM INTEGRATION ---
const ADSGRAM_BLOCKS = {
  reward: "57548",
  interstitial: "int-57549"
};
const AD_COOLDOWN_MS = 10 * 60 * 1000;
const AdControllers = window.Adsgram
  ? Object.fromEntries(
      Object.entries(ADSGRAM_BLOCKS).map(([format, blockId]) => [
        format,
        window.Adsgram.init({ blockId, debug: false })
      ])
    )
  : {};

const adButton = document.getElementById("show-ad");
const adCooldown = document.getElementById("ad-cooldown");
let adCooldownTimer = null;

function renderAdCooldown() {
  const nextAdAt = Number.parseInt(localStorage.getItem(adCooldownStorageKey) ?? "0", 10);
  const remainingMs = Math.max(0, nextAdAt - Date.now());
  if (remainingMs === 0) {
    adButton.disabled = false;
    adCooldown.textContent = "";
    if (adCooldownTimer !== null) {
      clearInterval(adCooldownTimer);
      adCooldownTimer = null;
    }
    return;
  }

  adButton.disabled = true;
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  adCooldown.textContent = `পরের ভিডিও ad দেখতে পারবেন ${minutes}:${String(seconds).padStart(2, "0")} পরে।`;
  if (adCooldownTimer === null) {
    adCooldownTimer = setInterval(renderAdCooldown, 1000);
  }
}

renderAdCooldown();
adButton.addEventListener("click", () => {
  if (Date.now() < Number.parseInt(localStorage.getItem(adCooldownStorageKey) ?? "0", 10)) {
    renderAdCooldown();
    return;
  }
  if (!AdControllers.reward) {
    document.getElementById("ad-status").textContent = "Reward ad লোড হয়নি। পরে আবার চেষ্টা করুন।";
    return;
  }
  adButton.disabled = true;
  document.getElementById("ad-status").textContent = "বিজ্ঞাপন লোড হচ্ছে...";
  AdControllers.reward.show()
    .then(() => {
      if (!updateCoins(100)) {
        document.getElementById("ad-status").textContent = "কয়েন যোগ করা যায়নি। আবার চেষ্টা করুন।";
        return;
      }
      localStorage.setItem(adCooldownStorageKey, String(Date.now() + AD_COOLDOWN_MS));
      document.getElementById("ad-status").textContent = "সফল! ১০০ কয়েন যোগ হয়েছে।";
      renderAdCooldown();
      notifySuccess();
    })
    .catch((err) => {
      document.getElementById("ad-status").textContent =
        "বিজ্ঞাপন দেখানো যায়নি। পরে আবার চেষ্টা করুন।";
      console.error(err);
    })
    .finally(() => {
      if (Date.now() >= Number.parseInt(localStorage.getItem(adCooldownStorageKey) ?? "0", 10)) {
        adButton.disabled = false;
      }
    });
});

const taskStatus = document.getElementById("task-status");
if (tg?.initData && customElements.get("adsgram-task")) {
  const taskAd = document.createElement("adsgram-task");
  taskAd.id = "task-ad";
  taskAd.dataset.blockId = "task-57550";
  taskAd.addEventListener("reward", () => {
    if (updateCoins(50)) {
      taskStatus.textContent = "Task সম্পন্ন! ৫০ কয়েন balance-এ যোগ হয়েছে।";
    } else {
      taskStatus.textContent = "কয়েন যোগ করা যায়নি। পরে আবার চেষ্টা করুন।";
    }
    notifySuccess();
  });
  taskAd.addEventListener("onBannerNotFound", () => {
    taskStatus.textContent = "এখন কোনো Task ad নেই। পরে আবার চেষ্টা করুন।";
  });
  taskAd.addEventListener("onError", (event) => {
    taskStatus.textContent = "Task ad লোড করা যায়নি।";
    console.error("Adsgram task failed:", event.detail);
  });
  document.getElementById("task-ad-slot").appendChild(taskAd);
} else {
  taskStatus.textContent = "Task ad দেখতে Telegram Mini App খুলুন।";
}

// --- 3B. SUPABASE WALLET REQUESTS AND LIVE LEADERBOARD ---
const COINS_PER_USDT = 10000;
const MIN_WITHDRAW_COINS = 2000;
const withdrawForm = document.getElementById("withdraw-form");
const withdrawAmountInput = document.getElementById("withdraw-coins");
const withdrawAddressInput = document.getElementById("withdraw-address");
const withdrawUsdt = document.getElementById("withdraw-usdt");
const withdrawStatus = document.getElementById("withdraw-status");
const withdrawSubmit = document.getElementById("withdraw-submit");
const leaderboardList = document.getElementById("leaderboard-list");
const leaderboardStatus = document.getElementById("leaderboard-status");

withdrawAmountInput.value = String(Math.max(MIN_WITHDRAW_COINS, Math.min(coins, 10000)));
renderWithdrawalEstimate = function renderWithdrawalEstimate() {
  const amount = Number.parseInt(withdrawAmountInput.value, 10);
  withdrawUsdt.textContent = Number.isSafeInteger(amount) && amount >= 0
    ? `${(amount / COINS_PER_USDT).toFixed(4)} USDT`
    : "0.0000 USDT";
};
withdrawAmountInput.addEventListener("input", renderWithdrawalEstimate);
renderWithdrawalEstimate();
syncLeaderboard().catch((err) => {
  console.error("Initial leaderboard sync failed:", err);
});

withdrawForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = Number(withdrawAmountInput.value);
  const address = withdrawAddressInput.value.trim();

  if (!telegramUser || !Number.isSafeInteger(telegramUser.id)) {
    withdrawStatus.textContent = "Withdraw request-এর জন্য Telegram Mini App-এ লগইন করুন।";
    return;
  }
  if (!Number.isSafeInteger(amount) || amount < MIN_WITHDRAW_COINS || amount > coins) {
    withdrawStatus.textContent = `কমপক্ষে ${MIN_WITHDRAW_COINS} coins এবং balance-এর বেশি নয়—এমন পরিমাণ দিন।`;
    return;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    withdrawStatus.textContent = "একটি সঠিক 0x BEP20 wallet address দিন।";
    return;
  }
  if (!supabaseClient) {
    withdrawStatus.textContent = "Supabase client লোড হয়নি। ইন্টারনেট connection যাচাই করে আবার চেষ্টা করুন।";
    return;
  }

  withdrawSubmit.disabled = true;
  withdrawStatus.textContent = "Withdrawal request পাঠানো হচ্ছে...";
  try {
    const { error } = await supabaseClient.from("withdrawal_requests").insert({
      telegram_id: telegramUser.id,
      username: telegramUser.username ?? null,
      display_name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ") || "Player",
      coins: amount,
      usdt_amount: (amount / COINS_PER_USDT).toFixed(4),
      wallet_address: address,
      network: "BEP20"
    });
    if (error) throw error;

    withdrawStatus.textContent =
      "Request Supabase-এ জমা হয়েছে; admin হাতে যাচাই করে payout করবে। Balance কেটে নেওয়া হয়নি।";
    notifySuccess();
  } catch (err) {
    console.error("Withdrawal request failed:", err);
    withdrawStatus.textContent =
      err?.code === "23505"
        ? "আপনার একটি request আগে থেকেই pending আছে। Admin review-এর জন্য অপেক্ষা করুন।"
        : "Request জমা হয়নি। Supabase schema/policy ও connection যাচাই করুন।";
    withdrawSubmit.disabled = false;
  }
});

function renderLeaderboard(rows) {
  leaderboardList.replaceChildren();
  if (rows.length === 0) {
    const item = document.createElement("li");
    item.textContent = "এখনো leaderboard-এ কেউ নেই।";
    leaderboardList.appendChild(item);
    return;
  }

  rows.forEach((player) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const score = document.createElement("strong");
    name.textContent = player.username ? `@${player.username}` : player.display_name;
    score.textContent = `${Number(player.lifetime_coins).toLocaleString()} coins`;
    item.append(name, score);
    leaderboardList.appendChild(item);
  });
}

async function loadLeaderboard() {
  if (!supabaseClient) {
    leaderboardList.replaceChildren();
    const item = document.createElement("li");
    item.textContent = "Supabase client লোড হয়নি।";
    leaderboardList.appendChild(item);
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("leaderboard")
      .select("telegram_id, username, display_name, lifetime_coins")
      .order("lifetime_coins", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(10);
    if (error) throw error;
    renderLeaderboard(data ?? []);
    leaderboardStatus.textContent = "";
  } catch (err) {
    console.error("Leaderboard load failed:", err);
    leaderboardList.replaceChildren();
    const item = document.createElement("li");
    item.textContent = "Supabase schema setup না হওয়া পর্যন্ত leaderboard unavailable.";
    leaderboardList.appendChild(item);
    leaderboardStatus.textContent = "Leaderboard লোড হয়নি। supabase-schema.sql চালানো হয়েছে কি না যাচাই করুন।";
  }
}

loadLeaderboard();
if (supabaseClient) {
  supabaseClient
    .channel("mahin6-live-leaderboard")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "leaderboard"
    }, () => {
      loadLeaderboard().catch((err) => {
        console.error("Live leaderboard refresh failed:", err);
      });
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        leaderboardStatus.textContent = "Leaderboard live update সংযুক্ত হয়নি। Supabase Realtime setup যাচাই করুন।";
      }
    });
}

let completedRounds = 0;
const INTERSTITIAL_EVERY_ROUNDS = 3;
function finishGameRound() {
  completedRounds++;
  if (completedRounds < INTERSTITIAL_EVERY_ROUNDS) return;
  completedRounds = 0;

  const interstitialStatus = document.getElementById("interstitial-status");
  if (!AdControllers.interstitial) {
    interstitialStatus.textContent = "পরের গেমগুলো খেলার সময় interstitial ad দেখানো হবে।";
    return;
  }
  interstitialStatus.textContent = "Interstitial ad লোড হচ্ছে...";
  AdControllers.interstitial.show().catch((err) => {
    interstitialStatus.textContent = "এই মুহূর্তে interstitial ad পাওয়া যায়নি।";
    console.error("Adsgram interstitial failed:", err);
  });
}

// --- 4. TAB NAVIGATION ---
document.querySelectorAll(".bottom-nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const pageId = button.dataset.page;
    document.querySelectorAll(".page-view").forEach((page) => {
      page.classList.toggle("active", page.id === `page-${pageId}`);
    });
    document.querySelectorAll(".bottom-nav-btn").forEach((navButton) => {
      const isActive = navButton === button;
      navButton.classList.toggle("active", isActive);
      if (isActive) {
        navButton.setAttribute("aria-current", "page");
      } else {
        navButton.removeAttribute("aria-current");
      }
    });
  });
});

document.getElementById("open-profile-wallet").addEventListener("click", () => {
  document.querySelector('.bottom-nav-btn[data-page="wallet"]').click();
});

function switchGame(gameId, buttonElement) {
  document.querySelectorAll(".game-view").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById(`view-${gameId}`).classList.add("active");
  buttonElement.classList.add("active");
}

// --- 4B. EXTRA MINI GAMES (20 GAMES TOTAL) ---
const extraGames = [
  { id: "color-pick", title: "🎨 Color Pick", description: "লক্ষ্য রঙটি বেছে নিন।", type: "color" },
  { id: "odd-even", title: "🔢 Odd or Even", description: "সংখ্যাটি জোড়, নাকি বিজোড়?", type: "odd-even" },
  { id: "high-low", title: "🃏 Higher or Lower", description: "পরের কার্ডটি বড় হবে নাকি ছোট?", type: "high-low" },
  { id: "word-scramble", title: "🔤 Word Scramble", description: "এলোমেলো অক্ষর সাজিয়ে শব্দটি লিখুন।", type: "word-scramble" },
  { id: "reaction-test", title: "⚡ Reaction Test", description: "সবুজ হলে যত দ্রুত পারেন চাপ দিন।", type: "reaction" },
  { id: "sequence-memory", title: "🧠 Number Sequence", description: "দেখানো সংখ্যার ক্রম মনে রেখে লিখুন।", type: "sequence" },
  { id: "quick-quiz", title: "❓ Quick Quiz", description: "প্রশ্নের সঠিক উত্তর বেছে নিন।", type: "quiz" },
  { id: "number-order", title: "🔟 Number Order", description: "১ থেকে ৫ পর্যন্ত ক্রমানুসারে চাপ দিন।", type: "order" },
  { id: "emoji-math", title: "➕ Emoji Math", description: "দ্রুত অংকটি সমাধান করুন।", type: "math" },
  { id: "emoji-count", title: "🔎 Emoji Count", description: "লক্ষ্য emoji-টি কতবার আছে গুনুন।", type: "count" },
  { id: "word-guess", title: "📝 Word Guess", description: "ইংরেজি শব্দটি অনুমান করুন।", type: "word-guess" },
  { id: "shape-match", title: "🔷 Shape Match", description: "লক্ষ্য চিহ্নটির সাথে মেলে এমনটি বেছে নিন।", type: "shape" }
];
const extraGameStates = new Map();
const extraGameTabContainer = document.getElementById("extra-game-tabs");
const extraGameViewContainer = document.getElementById("extra-game-views");
const colorOptions = [
  { name: "লাল", color: "#ef4444" },
  { name: "নীল", color: "#3b82f6" },
  { name: "সবুজ", color: "#22c55e" },
  { name: "হলুদ", color: "#eab308" }
];
const scrambledWords = ["PLANET", "GARDEN", "POCKET", "BRIDGE", "ORANGE", "STREAM"];
const guessWords = ["APPLE", "TIGER", "MANGO", "CLOUD", "SHEEP", "BREAD"];
const quizQuestions = [
  { question: "লাল গ্রহ কোনটি?", answer: "মঙ্গল", options: ["মঙ্গল", "শুক্র", "বৃহস্পতি"] },
  { question: "এক সপ্তাহে কয় দিন?", answer: "৭", options: ["৫", "৬", "৭"] },
  { question: "পানির রাসায়নিক সংকেত কী?", answer: "H₂O", options: ["CO₂", "H₂O", "O₂"] },
  { question: "বাংলাদেশের জাতীয় ফুল কোনটি?", answer: "শাপলা", options: ["গোলাপ", "শাপলা", "জবা"] }
];
const shapeOptions = ["🔷", "🔺", "⭐", "❤️"];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function makeGameButton(label, action, value = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "action-btn extra-game-btn";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.value = String(value);
  return button;
}

function createExtraGame(game) {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "tab-btn";
  tab.textContent = game.title;
  tab.addEventListener("click", () => {
    switchGame(game.id, tab);
    if (!extraGameStates.get(game.id).started) startExtraGame(game.id);
  });
  extraGameTabContainer.appendChild(tab);

  const view = document.createElement("section");
  view.className = "game-view extra-game-view";
  view.id = `view-${game.id}`;
  const title = document.createElement("h3");
  title.className = "game-title";
  title.textContent = game.title;
  const description = document.createElement("p");
  description.className = "game-instructions";
  description.textContent = game.description;
  const prompt = document.createElement("p");
  prompt.className = "extra-game-prompt";
  prompt.id = `prompt-${game.id}`;
  prompt.textContent = "খেলতে এই game-টি খুলুন।";
  const controls = document.createElement("div");
  controls.className = "extra-game-controls";
  controls.id = `controls-${game.id}`;
  const status = document.createElement("p");
  status.className = "status-alert";
  status.id = `status-${game.id}`;
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  view.append(title, description, prompt, controls, status);
  extraGameViewContainer.appendChild(view);
  extraGameStates.set(game.id, {
    game,
    prompt,
    controls,
    status,
    timer: null,
    done: false,
    started: false
  });
}

function finishExtraGame(gameId, won, message) {
  const state = extraGameStates.get(gameId);
  if (!state || state.done) return;
  state.done = true;
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.status.textContent = won ? `${message} (+${state.reward} coins — claim করুন)` : message;
  if (won) updatePendingCoins(state.reward);
  state.controls.querySelectorAll("button, input").forEach((control) => {
    control.disabled = true;
  });
  const playAgain = makeGameButton("Play another round", "restart");
  playAgain.addEventListener("click", () => startExtraGame(gameId));
  state.controls.appendChild(playAgain);
  finishGameRound();
}

function startExtraGame(gameId) {
  const state = extraGameStates.get(gameId);
  if (!state) return;
  if (state.timer !== null) clearTimeout(state.timer);
  state.timer = null;
  state.done = false;
  state.started = true;
  state.reward = 20;
  state.controls.replaceChildren();
  state.status.textContent = "";

  const addChoiceButtons = (options, handler) => {
    options.forEach((option) => {
      const button = makeGameButton(option.label, "choice", option.value);
      if (option.color) button.style.setProperty("--choice-color", option.color);
      button.addEventListener("click", () => handler(option.value));
      state.controls.appendChild(button);
    });
  };
  const addAnswerInput = (placeholder, submitLabel, handler) => {
    const input = document.createElement("input");
    input.className = "extra-game-input";
    input.type = "text";
    input.autocomplete = "off";
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder);
    const submit = makeGameButton(submitLabel, "submit");
    submit.addEventListener("click", () => handler(input.value.trim()));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handler(input.value.trim());
    });
    state.controls.append(input, submit);
    return input;
  };

  switch (state.game.type) {
    case "color": {
      const target = randomItem(colorOptions);
      state.reward = 15;
      state.prompt.textContent = `এই রঙটি বেছে নিন: ${target.name}`;
      addChoiceButtons(colorOptions.map((option) => ({
        label: option.name,
        value: option.name,
        color: option.color
      })), (choice) => finishExtraGame(
        gameId,
        choice === target.name,
        choice === target.name ? "সঠিক রঙ!" : `ভুল হয়েছে। সঠিক রঙ ছিল ${target.name}।`
      ));
      break;
    }
    case "odd-even": {
      const number = Math.floor(Math.random() * 99) + 1;
      const answer = number % 2 === 0 ? "জোড়" : "বিজোড়";
      state.prompt.textContent = `সংখ্যা: ${number}`;
      addChoiceButtons(["জোড়", "বিজোড়"].map((value) => ({ label: value, value })),
        (choice) => finishExtraGame(gameId, choice === answer,
          choice === answer ? "একদম ঠিক!" : `ভুল। সংখ্যাটি ${answer} ছিল।`));
      break;
    }
    case "high-low": {
      const current = Math.floor(Math.random() * 12) + 1;
      const next = Math.floor(Math.random() * 12) + 1;
      state.prompt.textContent = `বর্তমান কার্ড ${current}। পরের কার্ডটি?`;
      addChoiceButtons([
        { label: "⬆️ Higher", value: "higher" },
        { label: "⬇️ Lower", value: "lower" }
      ], (choice) => {
        const answer = next > current ? "higher" : next < current ? "lower" : "same";
        const won = choice === answer;
        finishExtraGame(gameId, won,
          answer === "same" ? `পরের কার্ড ${next} — একই!` :
            `পরের কার্ড ${next} — ${won ? "সঠিক অনুমান!" : "ভুল অনুমান।"}`);
      });
      break;
    }
    case "word-scramble": {
      const word = randomItem(scrambledWords);
      const offset = Math.floor(Math.random() * (word.length - 1)) + 1;
      const scrambled = word.slice(offset) + word.slice(0, offset);
      state.reward = 25;
      state.prompt.textContent = `শব্দটি সাজান: ${scrambled}`;
      addAnswerInput("শব্দটি লিখুন", "Check", (answer) => {
        finishExtraGame(gameId, answer.toUpperCase() === word,
          answer.toUpperCase() === word ? "সঠিক শব্দ!" : `ভুল। শব্দটি ছিল ${word}।`);
      });
      break;
    }
    case "reaction": {
      state.reward = 15;
      state.prompt.textContent = "সবুজ সংকেত না আসা পর্যন্ত অপেক্ষা করুন।";
      const button = makeGameButton("Start", "start");
      button.addEventListener("click", () => {
        if (state.done || button.dataset.state) return;
        button.dataset.state = "waiting";
        button.textContent = "অপেক্ষা করুন...";
        button.disabled = true;
        state.timer = setTimeout(() => {
          state.timer = null;
          if (state.done) return;
          button.dataset.state = "ready";
          button.textContent = "এখন চাপ দিন!";
          button.disabled = false;
          button.classList.add("reaction-ready");
        }, 1200 + Math.floor(Math.random() * 1800));
      });
      button.addEventListener("click", () => {
        if (button.dataset.state !== "ready") return;
        finishExtraGame(gameId, true, "দারুণ reaction!");
      });
      state.controls.appendChild(button);
      break;
    }
    case "sequence": {
      state.reward = 25;
      const sequence = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join("");
      state.prompt.textContent = `ক্রমটি মনে রাখুন: ${sequence}`;
      const input = addAnswerInput("৪টি সংখ্যা লিখুন", "Check", (answer) => {
        finishExtraGame(gameId, answer === sequence,
          answer === sequence ? "সঠিক ক্রম!" : `ভুল। সঠিক ক্রম ছিল ${sequence}।`);
      });
      input.disabled = true;
      state.timer = setTimeout(() => {
        state.timer = null;
        if (state.done) return;
        state.prompt.textContent = "এখন মনে রাখা ৪টি সংখ্যা লিখুন।";
        input.disabled = false;
        input.focus();
      }, 1600);
      break;
    }
    case "quiz": {
      const question = randomItem(quizQuestions);
      state.reward = 15;
      state.prompt.textContent = question.question;
      addChoiceButtons(question.options.map((value) => ({ label: value, value })),
        (choice) => finishExtraGame(gameId, choice === question.answer,
          choice === question.answer ? "সঠিক উত্তর!" : `সঠিক উত্তর: ${question.answer}`));
      break;
    }
    case "order": {
      state.reward = 20;
      const numbers = [1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
      let expected = 1;
      state.prompt.textContent = "১ → ২ → ৩ → ৪ → ৫ ক্রমে চাপুন।";
      addChoiceButtons(numbers.map((value) => ({ label: String(value), value })),
        (choice) => {
          if (Number(choice) !== expected) {
            finishExtraGame(gameId, false, "ভুল ক্রম—আবার চেষ্টা করুন!");
            return;
          }
          expected++;
          if (expected === 6) finishExtraGame(gameId, true, "সব সংখ্যা সঠিক ক্রমে!");
        });
      break;
    }
    case "math": {
      const first = Math.floor(Math.random() * 20) + 1;
      const second = Math.floor(Math.random() * 20) + 1;
      const answer = first + second;
      state.reward = 15;
      state.prompt.textContent = `${first} + ${second} = ?`;
      addAnswerInput("উত্তর", "Check", (value) => {
        finishExtraGame(gameId, Number(value) === answer,
          Number(value) === answer ? "সঠিক হিসাব!" : `ভুল। উত্তর ছিল ${answer}।`);
      });
      break;
    }
    case "count": {
      const target = randomItem(["🍎", "⭐", "🐱"]);
      const answer = Math.floor(Math.random() * 5) + 1;
      const symbols = [
        ...Array.from({ length: answer }, () => target),
        ...Array.from({ length: 8 - answer }, () =>
          randomItem(["🍎", "⭐", "🐱"].filter((item) => item !== target))
        )
      ].sort(() => Math.random() - 0.5);
      state.reward = 15;
      state.prompt.textContent = `${symbols.join(" ")}\n\n${target} কয়টি আছে?`;
      addChoiceButtons([1, 2, 3, 4, 5].map((value) => ({ label: String(value), value })),
        (choice) => finishExtraGame(gameId, Number(choice) === answer,
          Number(choice) === answer ? "সঠিক গুনেছেন!" : `ভুল। ${target} ছিল ${answer}টি।`));
      break;
    }
    case "word-guess": {
      const word = randomItem(guessWords);
      state.reward = 20;
      state.prompt.textContent = `শব্দ: ${word[0]} _ _ _ ${word[word.length - 1]} (${word.length} অক্ষর)`;
      addAnswerInput("সম্পূর্ণ শব্দ লিখুন", "Guess", (answer) => {
        finishExtraGame(gameId, answer.toUpperCase() === word,
          answer.toUpperCase() === word ? "শব্দটি ঠিক ধরেছেন!" : `শব্দটি ছিল ${word}।`);
      });
      break;
    }
    case "shape": {
      const target = randomItem(shapeOptions);
      state.reward = 15;
      state.prompt.textContent = `এই চিহ্নটি খুঁজুন: ${target}`;
      addChoiceButtons(shapeOptions.map((value) => ({ label: value, value })),
        (choice) => finishExtraGame(gameId, choice === target,
          choice === target ? "মিলেছে!" : `মেলেনি। লক্ষ্য ছিল ${target}।`));
      break;
    }
  }
}

extraGames.forEach(createExtraGame);

// --- GAME 1: TIC-TAC-TOE (X vs O) ---
let tttBoard = ["", "", "", "", "", "", "", "", ""];
let tttActive = true;
let aiTimer = null;
const tttGrid = document.getElementById("ttt-grid");

function renderTTT() {
  tttGrid.innerHTML = "";
  tttBoard.forEach((val, i) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `ttt-cell ${val}`;
    cell.textContent = val;
    cell.disabled = val !== "" || !tttActive;
    cell.setAttribute("aria-label", val ? `ঘর ${i + 1}: ${val}` : `ঘর ${i + 1}, খালি`);
    cell.onclick = () => playerMove(i);
    tttGrid.appendChild(cell);
  });
}

function playerMove(i) {
  if (tttBoard[i] !== "" || !tttActive) return;
  tttBoard[i] = "X";
  tttActive = false;

  if (checkWinner("X")) {
    renderTTT();
    document.getElementById("ttt-status").innerText = "আপনি জিতেছেন! (+30 coins — claim করুন)";
    updatePendingCoins(30);
    finishGameRound();
    return;
  }
  if (!tttBoard.includes("")) {
    renderTTT();
    document.getElementById("ttt-status").innerText = "ম্যাচ ড্র হয়েছে!";
    finishGameRound();
    return;
  }

  renderTTT();
  document.getElementById("ttt-status").innerText = "AI move dichhe...";
  aiTimer = setTimeout(aiMove, 350);
}

function aiMove() {
  aiTimer = null;
  if (tttActive) return;

  let bestScore = -Infinity;
  let bestMoves = [];
  tttBoard.forEach((value, index) => {
    if (value !== "") return;
    tttBoard[index] = "O";
    const score = minimax(false, 0);
    tttBoard[index] = "";
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [index];
    } else if (score === bestScore) {
      bestMoves.push(index);
    }
  });
  if (bestMoves.length === 0) return;

  const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  tttBoard[pick] = "O";
  if (checkWinner("O")) {
    renderTTT();
    document.getElementById("ttt-status").innerText = "AI জিতেছে! আবার চেষ্টা করুন।";
    finishGameRound();
    return;
  }
  if (!tttBoard.includes("")) {
    renderTTT();
    document.getElementById("ttt-status").innerText = "ম্যাচ ড্র হয়েছে!";
    finishGameRound();
    return;
  }

  tttActive = true;
  renderTTT();
  document.getElementById("ttt-status").innerText = "আপনার চাল (X)";
}

function minimax(isMaximizing, depth) {
  if (checkWinner("O")) return 10 - depth;
  if (checkWinner("X")) return depth - 10;
  if (!tttBoard.includes("")) return 0;

  let bestScore = isMaximizing ? -Infinity : Infinity;
  tttBoard.forEach((value, index) => {
    if (value !== "") return;
    tttBoard[index] = isMaximizing ? "O" : "X";
    const score = minimax(!isMaximizing, depth + 1);
    tttBoard[index] = "";
    bestScore = isMaximizing
      ? Math.max(bestScore, score)
      : Math.min(bestScore, score);
  });
  return bestScore;
}

function checkWinner(p) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  return lines.some(line => line.every(index => tttBoard[index] === p));
}

function resetTTT() {
  if (aiTimer !== null) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
  tttBoard = ["", "", "", "", "", "", "", "", ""];
  tttActive = true;
  document.getElementById("ttt-status").innerText = "আপনার চাল (X)";
  renderTTT();
}
renderTTT();

// --- GAME 2: COIN FLIP ---
function flipCoin(choice) {
  const result = Math.random() < 0.5 ? "Head" : "Tail";
  document.getElementById("coin-anim").innerText = "🪙";
  if (choice === result) {
    document.getElementById("coin-status").innerText =
      `ফলাফল: ${result}! সঠিক অনুমান (+20 coins — claim করুন)`;
    updatePendingCoins(20);
  } else {
    document.getElementById("coin-status").innerText =
      `ফলাফল: ${result}! ভুল হয়েছে, আবার চেষ্টা করুন।`;
  }
  finishGameRound();
}

// --- GAME 3: GUESS NUMBER ---
let secretNum = Math.floor(Math.random() * 10) + 1;

function checkGuess() {
  const input = document.getElementById("guess-input");
  const val = Number(input.value);
  if (!Number.isInteger(val) || val < 1 || val > 10) {
    document.getElementById("guess-status").innerText = "1 theke 10 er moddhe number dao!";
    return;
  }
  if (val === secretNum) {
    document.getElementById("guess-status").innerText =
      `সঠিক! সংখ্যাটি ছিল ${secretNum} (+30 coins — claim করুন)`;
    updatePendingCoins(30);
    finishGameRound();
    secretNum = Math.floor(Math.random() * 10) + 1;
    input.value = "";
  } else if (val < secretNum) {
    document.getElementById("guess-status").innerText = "Number ti aro boro, abar try koro.";
  } else {
    document.getElementById("guess-status").innerText = "Number ti aro choto, abar try koro.";
  }
}

// --- GAME 4: LUCKY DICE ---
const diceFaces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function rollDice() {
  const num = Math.floor(Math.random() * 6) + 1;
  document.getElementById("dice-face").innerText = diceFaces[num - 1];
  if (num === 6) {
    document.getElementById("dice-status").innerText = "ছক্কা (৬)! (+50 coins — claim করুন)";
    updatePendingCoins(50);
  } else {
    document.getElementById("dice-status").innerText = `উঠেছে: ${num}। ছক্কা এলে bonus পাবেন!`;
  }
  finishGameRound();
}

// --- GAME 5: TAP RUSH ---
let tapCount = 0;
let tapTimer = 5;
let tapActive = false;
let tapInterval = null;

function handleTap() {
  if (!tapActive && tapTimer === 5) {
    tapActive = true;
    tapCount = 1;
    document.getElementById("tap-count").innerText = tapCount;
    tapInterval = setInterval(() => {
      tapTimer--;
      document.getElementById("tap-timer").innerText = `Time: ${tapTimer}s`;
      if (tapTimer <= 0) {
        clearInterval(tapInterval);
        tapActive = false;
        let earned = Math.floor(tapCount / 2);
        updatePendingCoins(earned);
        document.getElementById("tap-status").innerText =
          `সময় শেষ! ${tapCount} বার tap করেছেন (+${earned} coins — claim করুন)`;
        finishGameRound();
        setTimeout(() => {
          tapTimer = 5;
          tapCount = 0;
          document.getElementById("tap-timer").innerText = "Time: 5s";
          document.getElementById("tap-count").innerText = "0";
        }, 2500);
      }
    }, 1000);
  } else if (tapActive) {
    tapCount++;
    document.getElementById("tap-count").innerText = tapCount;
  }
}

// --- GAME 6: MEMORY MATCH ---
const memorySymbols = ["🐱", "🍋", "🚀", "⭐", "🎮", "💎"];
const memoryBoard = document.getElementById("memory-board");
let memoryCards = [];
let memoryFlipped = [];
let memoryMatched = new Set();
let memoryLocked = false;
let memoryCompleted = false;
let memoryTimer = null;

function startMemoryGame() {
  if (memoryTimer !== null) {
    clearTimeout(memoryTimer);
    memoryTimer = null;
  }
  memoryCards = [...memorySymbols, ...memorySymbols].map((symbol) => ({ symbol }));
  for (let index = memoryCards.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [memoryCards[index], memoryCards[swapIndex]] =
      [memoryCards[swapIndex], memoryCards[index]];
  }
  memoryFlipped = [];
  memoryMatched = new Set();
  memoryLocked = false;
  memoryCompleted = false;
  document.getElementById("memory-status").textContent =
    "সব জোড়া মেলালে +60 coins পাবেন।";
  document.getElementById("memory-restart").textContent = "New Game";
  renderMemoryBoard();
}

function renderMemoryBoard() {
  memoryBoard.replaceChildren();
  memoryCards.forEach((card, index) => {
    const button = document.createElement("button");
    const isVisible = memoryFlipped.includes(index) || memoryMatched.has(index);
    button.type = "button";
    button.className = `memory-card${memoryMatched.has(index) ? " matched" : ""}`;
    button.textContent = isVisible ? card.symbol : "?";
    button.disabled = memoryLocked || memoryCompleted || memoryMatched.has(index) ||
      memoryFlipped.includes(index);
    button.setAttribute(
      "aria-label",
      isVisible ? `কার্ড ${index + 1}: ${card.symbol}` : `কার্ড ${index + 1}, ঢাকা`
    );
    button.addEventListener("click", () => flipMemoryCard(index));
    memoryBoard.appendChild(button);
  });
}

function flipMemoryCard(index) {
  if (memoryLocked || memoryCompleted || memoryMatched.has(index) ||
      memoryFlipped.includes(index)) return;
  memoryFlipped.push(index);

  if (memoryFlipped.length < 2) {
    renderMemoryBoard();
    return;
  }

  const [first, second] = memoryFlipped;
  if (memoryCards[first].symbol === memoryCards[second].symbol) {
    memoryMatched.add(first);
    memoryMatched.add(second);
    memoryFlipped = [];
    if (memoryMatched.size === memoryCards.length) {
      memoryCompleted = true;
      updatePendingCoins(60);
      document.getElementById("memory-status").textContent =
        "সব জোড়া মিলেছে! +60 coins — Claim করুন।";
      document.getElementById("memory-restart").textContent = "Play Again";
      finishGameRound();
    }
    renderMemoryBoard();
    return;
  }

  memoryLocked = true;
  renderMemoryBoard();
  memoryTimer = setTimeout(() => {
    memoryFlipped = [];
    memoryLocked = false;
    memoryTimer = null;
    renderMemoryBoard();
  }, 800);
}

startMemoryGame();

// --- GAME 7: ROCK PAPER SCISSORS ---
const rpsMoves = {
  rock: { label: "Rock", emoji: "✊" },
  paper: { label: "Paper", emoji: "✋" },
  scissors: { label: "Scissors", emoji: "✌️" }
};

function playRps(playerMove) {
  const choices = Object.keys(rpsMoves);
  const computerMove = choices[Math.floor(Math.random() * choices.length)];
  const player = rpsMoves[playerMove];
  const computer = rpsMoves[computerMove];
  if (!player) return;

  let outcome;
  if (playerMove === computerMove) {
    outcome = "ড্র হয়েছে!";
  } else if (
    (playerMove === "rock" && computerMove === "scissors") ||
    (playerMove === "paper" && computerMove === "rock") ||
    (playerMove === "scissors" && computerMove === "paper")
  ) {
    outcome = "আপনি জিতেছেন! +15 coins — Claim করুন।";
    updatePendingCoins(15);
  } else {
    outcome = "কম্পিউটার জিতেছে। আবার চেষ্টা করুন!";
  }

  document.getElementById("rps-status").textContent =
    `${player.emoji} বনাম ${computer.emoji} — ${outcome}`;
  finishGameRound();
}

// --- GAME 8: QUICK MATH ---
let mathRound = 1;
let mathScore = 0;
let mathAnswer = null;
let mathActive = false;

function createMathQuestion() {
  const operators = ["+", "-", "×"];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  let first = Math.floor(Math.random() * 12) + 1;
  let second = Math.floor(Math.random() * 12) + 1;
  if (operator === "-" && second > first) {
    [first, second] = [second, first];
  }

  mathAnswer = operator === "+"
    ? first + second
    : operator === "-"
      ? first - second
      : first * second;
  document.getElementById("math-question").textContent =
    `${first} ${operator} ${second} = ?`;
}

function startMathChallenge() {
  mathRound = 1;
  mathScore = 0;
  mathActive = true;
  document.getElementById("math-round").textContent = "Round 1 of 5";
  document.getElementById("math-status").textContent =
    "সঠিক উত্তরে +10 coins, মোট ৫টি প্রশ্ন।";
  document.getElementById("math-answer").value = "";
  document.getElementById("math-submit").hidden = false;
  document.getElementById("math-restart").hidden = true;
  createMathQuestion();
}

function submitMathAnswer() {
  const input = document.getElementById("math-answer");
  const value = input.value.trim();
  const answer = Number(value);
  if (!mathActive || value === "" || !Number.isInteger(answer)) {
    document.getElementById("math-status").textContent = "একটি পূর্ণসংখ্যার উত্তর লিখুন।";
    return;
  }

  if (answer === mathAnswer) {
    mathScore++;
    updatePendingCoins(10);
    document.getElementById("math-status").textContent = "সঠিক! +10 coins — Claim করুন।";
  } else {
    document.getElementById("math-status").textContent = `ভুল উত্তর। সঠিক উত্তর ছিল ${mathAnswer}।`;
  }

  if (mathRound === 5) {
    mathActive = false;
    document.getElementById("math-round").textContent = "Challenge complete";
    document.getElementById("math-question").textContent =
      `আপনার score: ${mathScore}/5`;
    document.getElementById("math-submit").hidden = true;
    document.getElementById("math-restart").hidden = false;
    finishGameRound();
    return;
  }

  mathRound++;
  document.getElementById("math-round").textContent = `Round ${mathRound} of 5`;
  input.value = "";
  createMathQuestion();
}

startMathChallenge();
