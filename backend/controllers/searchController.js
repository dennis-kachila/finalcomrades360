const { Product, Service, FastFood, Category, User, ServiceImage } = require('../models');
const { Sequelize } = require('../database/database');
const { Op } = require('sequelize');

exports.search = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.json({ products: [], services: [], fastfood: [] });
        }

        const query = `%${q}%`;
        const response = { products: [], services: [], fastfood: [] };

        // 1. Search Products
        try {
            response.products = await Product.findAll({
                where: {
                    [Op.and]: [
                        {
                            [Op.or]: [
                                { name: { [Op.like]: query } },
                                { description: { [Op.like]: query } },
                                { shortDescription: { [Op.like]: query } },
                                { keywords: { [Op.like]: query } }
                            ]
                        },
                        { status: 'active' },
                        { stock: { [Op.gt]: 0 } } // Hide out-of-stock products from search
                    ]
                },
                include: [
                    { model: Category, as: 'category', attributes: ['name'] },
                    { model: User, as: 'seller', attributes: ['name', 'businessName'] }
                ],
                limit: 20
            });
        } catch (err) {
            console.error('Product search error:', err);
        }

        // 2. Search Services
        try {
            const services = await Service.findAll({
                where: {
                    [Op.and]: [
                        {
                            [Op.or]: [
                                { title: { [Op.like]: query } },
                                { description: { [Op.like]: query } },
                                { location: { [Op.like]: query } }
                            ]
                        },
                        { status: 'approved' }
                    ]
                },
                include: [
                    { model: Category, as: 'category', attributes: ['name'] },
                    { model: User, as: 'provider', attributes: ['name', 'businessName'] },
                    { model: ServiceImage, as: 'images', attributes: ['imageUrl'], limit: 1 }
                ],
                limit: 20
            });

            // Enhance services with coverImage
            response.services = services.map(service => {
                const plainService = service.get({ plain: true });
                if (plainService.images && plainService.images.length > 0) {
                    plainService.coverImage = plainService.images[0].imageUrl;
                    plainService.images = [plainService.images[0]];
                }
                return plainService;
            });
        } catch (err) {
            console.error('Service search error:', err);
        }

        // 3. Search Fast Food
        try {
            response.fastfood = await FastFood.findAll({
                where: {
                    [Op.and]: [
                        {
                            [Op.or]: [
                                { name: { [Op.like]: query } },
                                { description: { [Op.like]: query } },
                                { shortDescription: { [Op.like]: query } }
                            ]
                        },
                        { isActive: true },
                        { approved: true }
                    ]
                },
                include: [
                    { model: User, as: 'vendorDetail', attributes: ['name', 'businessName'] }
                ],
                limit: 20
            });
        } catch (err) {
            console.error('FastFood search error:', err);
        }

        res.json(response);

    } catch (error) {
        console.error('Search init error:', error);
        res.status(500).json({ message: 'Search failed', error: error.message });
    }
};
