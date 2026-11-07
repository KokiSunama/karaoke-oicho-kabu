// 実行: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic.js');

const round = (scores) =>
  L.evaluateRound(Object.entries(scores).map(([playerId, raw]) => ({ playerId, raw })));

test('入力: 数字以外を除去して5桁までに切り詰める', () => {
  assert.equal(L.sanitizeRaw('84.722'), '84722');
  assert.equal(L.sanitizeRaw('847229'), '84722');
  assert.equal(L.sanitizeRaw('ab84c72'), '8472');
});

test('入力: 3桁目以降にドットを入れて表示する', () => {
  assert.equal(L.formatRaw('8'), '8');
  assert.equal(L.formatRaw('84'), '84');
  assert.equal(L.formatRaw('847'), '84.7');
  assert.equal(L.formatRaw('84722'), '84.722');
});

test('入力: 5桁揃って初めて完了', () => {
  assert.equal(L.isComplete('8472'), false);
  assert.equal(L.isComplete('84722'), true);
});

test('役: 3桁揃った時点で計算する。84.722は役9', () => {
  assert.equal(L.baseFromRaw('84'), null);
  assert.equal(L.baseFromRaw('847'), 9);
  assert.equal(L.baseFromRaw('84722'), 9);
});

test('革命: 全桁のどこでも3連続を検知する', () => {
  assert.equal(L.triggersRevolution('84442'), true);
  assert.equal(L.triggersRevolution('44412'), true);
  assert.equal(L.triggersRevolution('12999'), true);
  assert.equal(L.triggersRevolution('84722'), false);
  assert.equal(L.triggersRevolution('12399'), false);
});

test('革命: 入力途中でも検知する', () => {
  assert.equal(L.triggersRevolution('847'), false);
  assert.equal(L.triggersRevolution('8444'), true);
  assert.equal(L.tripleRunStart('8444'), 1);
});

test('勝敗: 同じカブなら9に近いほうが勝つ (9.22 > 9.33)', () => {
  const o = round({ a: '84722', b: '84733' });
  assert.equal(o.revolution, false);
  assert.deepEqual(o.winners.map((w) => w.playerId), ['a']);
});

test('勝敗: カブ以外の同じ役なら小数第二位以下が大きいほうが9に近い (8.99 > 8.12)', () => {
  const o = round({ a: '89112', b: '89199' });
  assert.deepEqual(o.winners.map((w) => w.playerId), ['b']);
});

test('勝敗: 役が違えば役の大きいほうが勝つ (カブ9.22 > オイチョ8.99)', () => {
  const o = round({ a: '89199', b: '84722' });
  assert.deepEqual(o.winners.map((w) => w.playerId), ['b']);
});

test('勝敗: 9との距離が同じでも役が違えば引き分けにしない (9.10 > 8.90)', () => {
  const o = round({ a: '89190', b: '84710' });
  assert.equal(o.winners.length, 1);
  assert.equal(o.winners[0].playerId, 'b');
});

test('勝敗: 役7以上がいればそこで勝者が決まる', () => {
  const o = round({ a: '61012', b: '60012' });
  assert.equal(o.hasWinner, true);
  assert.equal(o.winners[0].playerId, 'a');
});

test('勝敗: 役7以上が誰もいなければキャリーオーバー', () => {
  const o = round({ a: '50123', b: '30234' });
  assert.equal(o.revolution, false);
  assert.equal(o.hasWinner, false);
  assert.equal(o.winners.length, 0);
});

test('勝敗: 革命中は0に近いほうが勝つ', () => {
  const o = round({ a: '84442', b: '20010' });
  assert.equal(o.revolution, true);
  assert.equal(o.winners[0].playerId, 'b');
});

test('勝敗: 革命中に役2以下が誰もいなければキャリーオーバー', () => {
  const o = round({ a: '84442', b: '30500' });
  assert.equal(o.revolution, true);
  assert.equal(o.hasWinner, false);
});

test('勝敗: 同じ強さは全員勝者で順位も同じ', () => {
  const o = round({ a: '84722', b: '75722', c: '50123' });
  assert.equal(o.winners.length, 2);
  assert.deepEqual(o.results.map((r) => r.rank), [1, 1, 3]);
});

test('ベット: 基本額と途中参加額', () => {
  assert.equal(L.baseBet(3), 300);
  assert.equal(L.joinBet(0, 1), 100);
  assert.equal(L.joinBet(2, 1), 300);
  assert.equal(L.joinBet(1, 5), 1000);
});

test('ベット: 開始前の登録は無料で、途中参加は持ち点マイナスでポットに入る', () => {
  let g = L.addPlayerFree(L.createGame(1), 'A');
  assert.equal(g.players[0].chips, 0);
  assert.equal(g.pot, 0);
  g = { ...g, carryOverCount: 1 };
  g = L.addPlayer(g, 'B');
  assert.equal(g.players[1].chips, -200);
  assert.equal(g.pot, 200);
});

test('ベット: キャリーオーバー中でもアンティは一律', () => {
  let g = L.createGame(2);
  g = L.addPlayerFree(L.addPlayerFree(g, 'A'), 'B');
  g = { ...g, carryOverCount: 3 };
  g = L.collectAnte(g, g.players.map((p) => p.id));
  assert.ok(g.players.every((p) => p.chips === -200));
  assert.equal(g.pot, 400);
});

test('精算: 勝者なしならポットを繰り越してキャリーオーバーが増える', () => {
  let g = L.addPlayer(L.createGame(1), 'A');
  g = L.resolveRound(g, round({ [g.players[0].id]: '50123' }));
  assert.equal(g.carryOverCount, 1);
  assert.equal(g.pot, 100);
});

test('精算: 勝者がポットを総取りしてキャリーオーバーは0に戻る', () => {
  let g = L.addPlayer(L.addPlayer(L.createGame(1), 'A'), 'B');
  g = { ...g, carryOverCount: 2 };
  const [a, b] = g.players;
  g = L.resolveRound(g, round({ [a.id]: '84722', [b.id]: '50123' }));
  assert.equal(g.carryOverCount, 0);
  assert.equal(g.pot, 0);
  assert.equal(g.players[0].chips, 100);
  assert.equal(g.players[1].chips, -100);
});

test('精算: 山分けの端数はポットに残る', () => {
  let g = L.createGame(1);
  g = L.addPlayerFree(L.addPlayerFree(L.addPlayerFree(g, 'A'), 'B'), 'C');
  g = { ...g, pot: 301 };
  const [a, b, c] = g.players;
  g = L.resolveRound(g, round({ [a.id]: '84722', [b.id]: '84722', [c.id]: '84722' }));
  assert.deepEqual(g.players.map((p) => p.chips), [100, 100, 100]);
  assert.equal(g.pot, 1);
});
