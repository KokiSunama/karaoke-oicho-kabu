// カラオケおいちょかぶのルール判定(Expo版 src/logic/ の移植)。DOMに依存しないので node --test で検証できる
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OichoLogic = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RAW_SCORE_LENGTH = 5;
  const RATES = [1, 2, 3, 5, 10];
  const YAKU_NAMES = ['ブタ', 'ピン', 'ニゾウ', 'サンタ', 'ヨツヤ', 'ゴケ', 'ロッポウ', 'シチケン', 'オイチョ', 'カブ'];

  // 通常時は役7以上、革命時は役2以下の人がいなければ勝者なし(キャリーオーバー)
  const NORMAL_WIN_THRESHOLD = 7;
  const REVOLUTION_WIN_THRESHOLD = 2;

  // ---- 得点の入力 ----
  // 得点は常に XX.XXX 固定。入力と計算は「.」なしの数字列 raw("84722")で扱う

  function sanitizeRaw(input) {
    return String(input).replace(/[^0-9]/g, '').slice(0, RAW_SCORE_LENGTH);
  }

  function formatRaw(raw) {
    return raw.length <= 2 ? raw : `${raw.slice(0, 2)}.${raw.slice(2)}`;
  }

  function isComplete(raw) {
    return raw.length === RAW_SCORE_LENGTH;
  }

  // 十の位+一の位+小数第一位の合計の下1桁が役。3桁揃うまではnull
  function baseFromRaw(raw) {
    if (raw.length < 3) return null;
    return (Number(raw[0]) + Number(raw[1]) + Number(raw[2])) % 10;
  }

  // 同じ数字が3つ連続している位置(なければ-1)。入力途中でも判定できる
  function tripleRunStart(raw) {
    for (let i = 0; i <= raw.length - 3; i++) {
      if (raw[i] === raw[i + 1] && raw[i] === raw[i + 2]) return i;
    }
    return -1;
  }

  function triggersRevolution(raw) {
    return tripleRunStart(raw) !== -1;
  }

  // ---- ラウンドの勝敗 ----

  // key = 役×100 + 小数第二位×10 + 小数第三位 (84.722 → 922)。小数の誤差を避けるため整数で持つ
  function evaluateEntry(playerId, raw) {
    const base = baseFromRaw(raw);
    const key = base * 100 + Number(raw[3]) * 10 + Number(raw[4]);
    return { playerId, raw, base, key, triggersRevolution: triggersRevolution(raw) };
  }

  // 強い順に並べる比較関数。0を返すのは完全に同じ強さのときだけ
  // 通常時: 役が大きいほうが強く、同じ役の中では絶対値で9に近いほうが強い
  //   (カブ同士は 9.22 が 9.33 に勝ち、オイチョ同士は 8.99 が 8.12 に勝つ)
  // 革命時: 全桁まとめて0に近いほうが強い
  // Expo版は役をまたいで9との距離だけで比べるため 8.99 が 9.22 に勝ってしまう。
  // 仕様の「役が同点ならタイブレーク」に合わせて、ここでは役を先に比べている
  function compareStrength(revolution) {
    return (a, b) => {
      if (revolution) return a.key - b.key;
      return b.base - a.base || Math.abs(900 - a.key) - Math.abs(900 - b.key);
    };
  }

  // entries: [{ playerId, raw }]
  function evaluateRound(entries) {
    if (entries.length === 0) return { revolution: false, results: [], winners: [], hasWinner: false };

    const evaluated = entries.map((e) => evaluateEntry(e.playerId, e.raw));
    const revolution = evaluated.some((r) => r.triggersRevolution);
    const compare = compareStrength(revolution);
    const sorted = [...evaluated].sort(compare);

    // 同じ強さは同じ順位にする
    const results = [];
    sorted.forEach((r, i) => {
      const tied = i > 0 && compare(sorted[i - 1], r) === 0;
      results.push({ ...r, rank: tied ? results[i - 1].rank : i + 1 });
    });

    const topBase = results[0].base;
    const hasWinner = revolution ? topBase <= REVOLUTION_WIN_THRESHOLD : topBase >= NORMAL_WIN_THRESHOLD;
    return {
      revolution,
      results,
      winners: hasWinner ? results.filter((r) => r.rank === 1) : [],
      hasWinner,
    };
  }

  // ---- 持ち点とポット ----

  function createGame(rate = 1) {
    return { players: [], pot: 0, carryOverCount: 0, rate };
  }

  function baseBet(rate) {
    return 100 * rate;
  }

  // 途中参加ベット = (キャリーオーバー回数+1) × 100 × レート
  function joinBet(carryOverCount, rate) {
    return (carryOverCount + 1) * baseBet(rate);
  }

  let idCounter = 0;
  function nextPlayerId() {
    idCounter += 1;
    return `player-${Date.now()}-${idCounter}`;
  }

  // ゲーム開始前の登録。ベットは発生しない
  function addPlayerFree(game, name) {
    return { ...game, players: [...game.players, { id: nextPlayerId(), name, chips: 0 }] };
  }

  function removePlayer(game, playerId) {
    return { ...game, players: game.players.filter((p) => p.id !== playerId) };
  }

  // 途中参加。ベット分を持ち点から引いてポットへ入れる
  function addPlayer(game, name) {
    const bet = joinBet(game.carryOverCount, game.rate);
    return {
      ...game,
      players: [...game.players, { id: nextPlayerId(), name, chips: -bet }],
      pot: game.pot + bet,
    };
  }

  // ラウンド開始時に全員から基本ベットを集める(キャリーオーバー中でも一律)
  function collectAnte(game, playerIds) {
    const bet = baseBet(game.rate);
    return {
      ...game,
      players: game.players.map((p) => (playerIds.includes(p.id) ? { ...p, chips: p.chips - bet } : p)),
      pot: game.pot + bet * playerIds.length,
    };
  }

  // 勝者がいればポットを山分け(割り切れない端数はポットに残す)。いなければ繰り越し
  function resolveRound(game, outcome) {
    if (!outcome.hasWinner || outcome.winners.length === 0) {
      return { ...game, carryOverCount: game.carryOverCount + 1 };
    }
    const winnerIds = new Set(outcome.winners.map((w) => w.playerId));
    const share = Math.floor(game.pot / outcome.winners.length);
    return {
      ...game,
      players: game.players.map((p) => (winnerIds.has(p.id) ? { ...p, chips: p.chips + share } : p)),
      pot: game.pot - share * outcome.winners.length,
      carryOverCount: 0,
    };
  }

  return {
    RAW_SCORE_LENGTH,
    RATES,
    YAKU_NAMES,
    sanitizeRaw,
    formatRaw,
    isComplete,
    baseFromRaw,
    tripleRunStart,
    triggersRevolution,
    evaluateRound,
    createGame,
    baseBet,
    joinBet,
    addPlayerFree,
    removePlayer,
    addPlayer,
    collectAnte,
    resolveRound,
  };
});
