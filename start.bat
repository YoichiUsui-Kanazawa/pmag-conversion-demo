@echo off
rem ダブルクリックで簡易サーバーを起動し、ブラウザでデモを開く（Node.js が必要）
cd /d "%~dp0"
start "" "http://localhost:8080/"
echo サーバーを起動しています。終了するにはこのウィンドウを閉じてください。
node scripts/serve.mjs 8080
pause
