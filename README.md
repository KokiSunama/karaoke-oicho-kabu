# カラオケおいちょかぶ

カラオケの採点結果(XX.XXX)でおいちょかぶをするスコア管理ページ。スマホ1台を回して使う。
Expo版アプリをWeb向けに作り直したもの。

公開ページ: https://kokisunama.github.io/karaoke-oicho-kabu/

- `index.html` 画面。`logic.js` ルール判定。`logic.test.js` ルールのテスト(`node --test`)
- 途中経過はブラウザの localStorage に保存されるので、タブを閉じても続きから遊べる
- スマホのブラウザで「ホーム画面に追加」すると、アプリっぽく全画面で開ける
- Expo版との違い: 役が違うときは必ず役の大きいほうが勝つ(Expo版は 8.99 が 9.22 に勝ってしまう)
