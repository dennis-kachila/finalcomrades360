const { Op } = require('sequelize');
const { HeroPromotion, Product, User, Notification, PlatformConfig, FastFood } = require('../models/index');

const getRateConfig = async () => {
  const rows = await PlatformConfig.findAll({ where: { key: { [Op.in]: ['HERO_RATE_PER_DAY', 'HERO_RATE_PER_PRODUCT'] } }, raw: true })
  const map = new Map(rows.map(r => [r.key, parseFloat(r.value)]))
  const perDay = Number.isFinite(map.get('HERO_RATE_PER_DAY')) ? map.get('HERO_RATE_PER_DAY') : 500
  const perProduct = Number.isFinite(map.get('HERO_RATE_PER_PRODUCT')) ? map.get('HERO_RATE_PER_PRODUCT') : 100
  return { perDay, perProduct }
}

const getHeroRates = async (req, res) => {
  try {
    const { perDay, perProduct } = await getRateConfig()
    // Also fetch payment instructions if available
    const instrRow = await PlatformConfig.findOne({ where: { key: 'HERO_PAYMENT_INSTRUCTIONS' } })
    res.json({
      perDay,
      perProduct,
      instructions: instrRow ? instrRow.value : 'Please pay via M-Pesa Till: 123456 (Comrades360) and upload the confirmation message screenshot.'
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
}

// Seller: edit an application before approval (cannot edit approved/scheduled/active)
const editMyHeroPromotion = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.userId
    const id = Number(req.params.id)
    const { productIds, durationDays, slotsCount } = req.body || {}
    const item = await HeroPromotion.findByPk(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (item.sellerId !== sellerId) return res.status(403).json({ error: 'Forbidden' })

    if (['approved', 'scheduled', 'active'].includes(item.status)) {
      return res.status(400).json({ error: 'Cannot edit after approval' })
    }

    if (Array.isArray(productIds) && productIds.length) {
      const products = await Product.findAll({ where: { id: { [Op.in]: productIds }, sellerId, approved: true }, attributes: ['id'] })
      if (products.length !== productIds.length) return res.status(400).json({ error: 'Invalid products' })
      item.productIds = productIds
    }
    if (durationDays != null) item.durationDays = Number(durationDays) || item.durationDays
    if (slotsCount != null) item.slotsCount = Number(slotsCount) || item.slotsCount

    // Recompute amount if changed inputs
    if (productIds || durationDays != null) {
      const { perDay, perProduct } = await getRateConfig()
      const ids = Array.isArray(item.productIds) ? item.productIds : []
      item.amount = (Number(item.durationDays) || 0) * (perDay + (ids.length * perProduct))
    }

    await item.save()
    return res.json({ ok: true, promotion: item })
  } catch (e) { return res.status(500).json({ error: e.message }) }
}

// Seller: delete an application before approval. If already paid, mark refund requested.
const deleteMyHeroPromotion = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.userId
    const id = Number(req.params.id)
    const { reason } = req.body || {}
    const item = await HeroPromotion.findByPk(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (item.sellerId !== sellerId) return res.status(403).json({ error: 'Forbidden' })

    if (['approved', 'scheduled', 'active'].includes(item.status)) {
      return res.status(400).json({ error: 'Cannot delete after approval' })
    }

    if (item.paymentStatus === 'paid') {
      // Convert to refund request
      item.status = 'cancelled'
      item.paymentStatus = 'refund_requested'
      if (reason) item.notes = reason
      await item.save()
      // Notify admins and seller
      try {
        const admins = await User.findAll({ where: { role: { [Op.in]: ['admin', 'super_admin'] } }, attributes: ['id'], raw: true })
        for (const a of admins) {
          await Notification.create({
            userId: a.id,
            title: 'Refund Requested: Hero Promotion',
            message: `Seller ${sellerId} requested a refund for hero promotion ID ${item.id}. Amount: KES ${item.amount}.`
          })
        }
        await Notification.create({ userId: sellerId, title: 'Refund Request Submitted', message: `We received your refund request for hero promotion ID ${item.id}. Admin will process it soon.` })
      } catch { }
      return res.json({ ok: true, refundRequested: true, promotion: item })
    } else {
      // Soft-cancel to keep history visible to admins
      item.status = 'cancelled'
      if (reason) item.notes = reason
      await item.save()
      // Acknowledge seller
      try { await Notification.create({ userId: sellerId, title: 'Promotion Cancelled', message: `Your hero promotion ID ${item.id} was cancelled.` }) } catch { }
      return res.json({ ok: true, deleted: true, promotion: item })
    }
  } catch (e) { return res.status(500).json({ error: e.message }) }
}

// Seller: explicitly request refund (for paid-but-not-approved cases)
const requestRefund = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.userId
    const id = Number(req.params.id)
    const { reason } = req.body || {}
    const item = await HeroPromotion.findByPk(id)
    if (!item) return res.status(404).json({ error: 'Not found' })
    if (item.sellerId !== sellerId) return res.status(403).json({ error: 'Forbidden' })

    if (['approved', 'scheduled', 'active'].includes(item.status)) {
      return res.status(400).json({ error: 'Cannot refund after approval/scheduling' })
    }
    if (item.paymentStatus !== 'paid') {
      return res.status(400).json({ error: 'Refund applicable only to paid applications' })
    }

    item.status = 'cancelled'
    item.paymentStatus = 'refund_requested'
    if (reason) item.notes = reason
    await item.save()
    // Notify admins and seller
    try {
      const admins = await User.findAll({ where: { role: { [Op.in]: ['admin', 'super_admin'] } }, attributes: ['id'], raw: true })
      for (const a of admins) {
        await Notification.create({ userId: a.id, title: 'Refund Requested: Hero Promotion', message: `Seller ${sellerId} requested a refund for hero promotion ID ${item.id}. Amount: KES ${item.amount}.` })
      }
      await Notification.create({ userId: sellerId, title: 'Refund Request Submitted', message: `We received your refund request for hero promotion ID ${item.id}. Admin will process it soon.` })
    } catch { }
    return res.json({ ok: true, promotion: item })
  } catch (e) { return res.status(500).json({ error: e.message }) }
}

const applyHeroPromotion = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.userId
    const { productIds = [], fastFoodIds = [], durationDays = 7, slotsCount = 1, promoType = 'product', title, subtitle } = req.body || {}


    const ids = promoType === 'fastfood' ? fastFoodIds : productIds;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: promoType === 'fastfood' ? 'fastFoodIds required' : 'productIds required' })
    }

    if (!title || !title.trim() || !subtitle || !subtitle.trim()) {
      return res.status(400).json({ error: 'Banner heading (title) and subheading (subtitle) are strictly required.' })
    }

    // verify items belong to seller and are approved
    if (promoType === 'fastfood') {
      const fastfoods = await FastFood.findAll({
        where: { id: { [Op.in]: ids }, vendor: sellerId, approved: true },
        attributes: ['id']
      })
      if (fastfoods.length !== ids.length) {
        return res.status(400).json({ error: 'One or more fastfood items invalid or not approved' })
      }
    } else {
      const products = await Product.findAll({
        where: { id: { [Op.in]: ids }, sellerId, approved: true },
        attributes: ['id']
      })
      if (products.length !== ids.length) {
        return res.status(400).json({ error: 'One or more products invalid or not approved' })
      }
    }

    const { perDay, perProduct } = await getRateConfig()
    const amount = (Number(durationDays) || 0) * (perDay + (ids.length * perProduct))

    const app = await HeroPromotion.create({
      sellerId,
      productIds: promoType === 'product' ? ids : [],
      fastFoodIds: promoType === 'fastfood' ? ids : [],
      promoType,
      status: 'pending_payment',
      paymentStatus: 'unpaid',
      amount,
      durationDays: Number(durationDays) || 7,
      slotsCount: Number(slotsCount) || 1,
      title,
      subtitle
    })

    return res.json({ ok: true, promotion: app })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

const myHeroPromotions = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.userId
    // Auto-expire past items for accuracy
    try {
      const now = new Date()
      await HeroPromotion.update(
        { status: 'expired' },
        { where: { sellerId, endAt: { [Op.lt]: now }, status: { [Op.in]: ['approved', 'scheduled', 'active', 'under_review'] } } }
      )
    } catch { }
    const items = await HeroPromotion.findAll({ where: { sellerId }, order: [['createdAt', 'DESC']] })
    res.json({ items })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

const listActiveHeroPromotions = async (req, res) => {
  try {
    const now = new Date()
    let items = await HeroPromotion.findAll({
      where: {
        status: 'active',
        startAt: { [Op.lte]: now },
        endAt: { [Op.gte]: now },
        isDefault: false
      },
      order: [['priority', 'DESC'], ['startAt', 'ASC']]
    })

    // Fallback: If no active promotions, fetch default ones
    if (items.length === 0) {
      items = await HeroPromotion.findAll({
        where: {
          status: 'active',
          isDefault: true
        },
        order: [['priority', 'DESC'], ['createdAt', 'DESC']]
      })
    }

    // hydrate with item details minimal
    const result = []
    for (const p of items) {
      if (p.promoType === 'fastfood') {
        const ids = p.fastFoodIds || []
        const fastfoods = ids.length > 0 ? await FastFood.findAll({
          where: { id: { [Op.in]: ids }, isAvailable: true },
          attributes: ['id', 'name', 'mainImage', 'galleryImages', 'basePrice', 'displayPrice', 'discountPrice', 'discountPercentage']
        }) : []
        result.push({ ...p.toJSON(), fastfoods })
      } else {
        const ids = p.productIds || []
        const prods = ids.length > 0 ? await Product.findAll({
          where: { id: { [Op.in]: ids }, stock: { [Op.gt]: 0 } },
          attributes: ['id', 'name', 'coverImage', 'galleryImages', 'price', 'displayPrice', 'discountPrice', 'discountPercentage']
        }) : []
        result.push({ ...p.toJSON(), products: prods })
      }
    }

    res.json({ items: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

// Seller: submit or update payment proof for a hero promotion application
const submitPaymentProof = async (req, res) => {
  try {
    const sellerId = req.user?.id || req.user?.userId
    const id = Number(req.params.id)
    const { paymentProofUrl } = req.body || {}
    if (!paymentProofUrl) return res.status(400).json({ error: 'paymentProofUrl required' })

    const app = await HeroPromotion.findByPk(id)
    if (!app) return res.status(404).json({ error: 'Not found' })
    if (app.sellerId !== sellerId && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Only allow attaching proof when not already paid
    if (app.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Payment already confirmed by admin' })
    }

    app.paymentProofUrl = paymentProofUrl
    // Move to under_review so admin can verify and mark as paid
    app.status = 'under_review'
    await app.save()
    // Notify admins to review payment proof
    try {
      const admins = await User.findAll({ where: { role: { [Op.in]: ['admin', 'super_admin'] } }, attributes: ['id'], raw: true })
      for (const a of admins) {
        await Notification.create({ userId: a.id, title: 'Payment Proof Submitted', message: `Seller ${app.sellerId} submitted payment proof for hero promotion ID ${app.id}. Please review.` })
      }
      await Notification.create({ userId: app.sellerId, title: 'Payment Proof Received', message: `We received your payment proof for hero promotion ID ${app.id}. An admin will confirm soon.` })
    } catch { }
    return res.json({ ok: true, promotion: app })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

module.exports = {
  getHeroRates,
  editMyHeroPromotion,
  deleteMyHeroPromotion,
  requestRefund,
  applyHeroPromotion,
  myHeroPromotions,
  listActiveHeroPromotions,
  submitPaymentProof
};
