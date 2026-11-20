# מוח חד: 100 חידות היגיון

משחק חידות היגיון בעברית: 100 חידות קלאסיות (30 קלות, 40 בינוניות, 30 קשות), עם רמזים, הסבר מלא לכל חידה, ניקוד, רצפים, 14 הישגים, סטטיסטיקה אישית וטבלת מובילים משותפת.

## מבנה

```
index.html              דף המשחק
css/style.css           עיצוב (Material 3, מצב בהיר וכהה)
js/puzzles.js           מאגר החידות
js/fx.js                צלילים, קונפטי, אפקט מגע
js/board.js             טבלת מובילים (Claude / Cloudflare / מקומי)
js/app.js               לוגיקת המשחק
functions/api/scores.js API של טבלת המובילים (Cloudflare Pages Function)
```

אין שלב build. אפשר לפתוח את `index.html` ישירות בדפדפן, ואז הכל עובד חוץ מטבלת המובילים, וההתקדמות נשמרת במכשיר.

## העלאה ל-Cloudflare Pages

1. ב-Cloudflare: Workers & Pages → Create → Pages → Connect to Git → בוחרים את `jeniaka/trivia`.
2. Framework preset: **None**. Build command: ריק. Build output directory: `/`.
3. Deploy. המשחק עולה מיד.

### הפעלת טבלת המובילים (פעם אחת)

1. Workers & Pages → KV → Create namespace, למשל בשם `trivia-scores`.
2. בפרויקט ה-Pages: Settings → Bindings → Add → KV namespace.
   - Variable name: **`SCORES`**
   - KV namespace: `trivia-scores`
3. לעשות Redeploy (Deployments → ⋯ → Retry deployment).

בלי החיבור הזה ה-API מחזיר 503, והמשחק מציג "טבלת המובילים עוד לא הוגדרה".

## איך טבלת המובילים עובדת

- **באתר:** כל דפדפן מקבל מזהה אקראי שנשמר אצלו. השרת שומר רק hash שלו, כך שאף אחד לא יכול לדרוס תוצאה של מישהו אחר. השחקן בוחר שם לטבלה.
- **בתוך Claude (artifact):** הטבלה נשמרת במאגר הנתונים המשותף של Claude, לפי המשתמש המחובר.
- איפוס התקדמות מוריד את השחקן מהטבלה.

## הוספת חידות

כל חידה ב-`js/puzzles.js` בנויה כך:

```js
{
  id: 101, difficulty: `קשה`, category: `אסטרטגיה`,
  question: `...`,
  hint: `...`,
  options: [`...`, `...`, `...`, `...`],
  correctIndex: 1,
  explanation: `...`
}
```

סדר התשובות מתערבב בכל הצגה. אם המספר הכולל משתנה, צריך לעדכן גם את `TOTAL_Q` ב-`js/board.js` וב-`functions/api/scores.js`.
