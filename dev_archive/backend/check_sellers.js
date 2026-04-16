const { User } = require('./models/index');

async function checkSellers() {
    try {
        const ids = [2, 1004];
        const sellers = await User.findAll({
            where: { id: ids },
            attributes: ['id', 'name', 'role', 'email']
        });

        console.log('--- Sellers Info ---');
        sellers.forEach(s => {
            console.log(`ID: ${s.id}, Name: ${s.name}, Role: ${s.role}, Email: ${s.email}`);
        });

    } catch (error) {
        console.error(error);
    } finally {
        process.exit();
    }
}

checkSellers();
