const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('backend/database.sqlite');

db.all("SELECT * FROM Category", (err, categories) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('--- Categories ---');
    console.table(categories);

    db.all("SELECT * FROM Subcategory", (err, subcategories) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        console.log('\n--- Subcategories ---');
        console.table(subcategories);

        db.close();
    });
});
