const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');
db.get("SELECT COUNT(*) as count FROM Category", (err, row) => {
    console.log('Category count:', row ? row.count : err.message);
    db.get("SELECT COUNT(*) as count FROM categories", (err2, row2) => {
        console.log('categories count:', row2 ? row2.count : err2.message);
        db.all("SELECT id, name FROM Category LIMIT 5", (err3, rows3) => {
            console.log('Category sample:', rows3);
            db.all("SELECT id, name FROM categories LIMIT 5", (err4, rows4) => {
                console.log('categories sample:', rows4);
                db.close();
            });
        });
    });
});
