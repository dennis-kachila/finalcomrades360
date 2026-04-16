const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('backend/database.sqlite');

db.all("SELECT * FROM Category WHERE name LIKE '%Food%'", (err, categories) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('--- Food Categories ---');
    console.log(JSON.stringify(categories, null, 2));

    if (categories.length > 0) {
        const ids = categories.map(c => c.id);
        db.all(`SELECT * FROM Subcategories WHERE categoryId IN (${ids.join(',')})`, (err, subcategories) => {
            if (err) {
                console.error(err);
                process.exit(1);
            }
            console.log('\n--- Food Subcategories ---');
            console.table(subcategories);
            db.close();
        });
    } else {
        console.log('No food categories found.');
        db.close();
    }
});
