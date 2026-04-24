import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { resolveImageUrl, FALLBACK_IMAGE } from '../../utils/imageUtils';
import { recursiveParse, ensureArray } from '../../utils/parsingUtils';

// Deeply unwrap multiply-JSON-stringified arrays and split on '",' separators
const deepUnwrapFeatures = (val) => {
  const deepUnwrap = (v) => {
    let cur = v;
    for (let i = 0; i < 10; i++) {
      if (typeof cur !== 'string') break;
      const t = cur.trim();
      if (!(t.startsWith('[') || t.startsWith('"'))) break;
      try { cur = JSON.parse(t); } catch { break; }
    }
    return cur;
  };
  const cleanItem = (s) => String(s).replace(/^["\[\]\s]+|["\[\]\s]+$/g, '').trim();
  const splitFlat = (s) => {
    if (s.includes('","') || s.includes("','")) {
      return s.split(/","|','/g).map(cleanItem).filter(Boolean);
    }
    const c = cleanItem(s);
    return c ? [c] : [];
  };

  let unwrapped = deepUnwrap(val);
  if (Array.isArray(unwrapped)) {
    return unwrapped
      .map(item => {
        const v = deepUnwrap(item);
        if (Array.isArray(v)) return v.map(x => cleanItem(String(x)));
        if (typeof v === 'string') return splitFlat(v);
        return [cleanItem(String(v))];
      })
      .flat(Infinity)
      .filter(Boolean);
  }
  if (typeof unwrapped === 'string' && unwrapped.trim()) return splitFlat(unwrapped);
  return [];
};

const SellerProductView = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fileBase = api.defaults.baseURL ? api.defaults.baseURL.replace(/\/?api\/?$/, '') : '';


  useEffect(() => {
    let alive = true;
    const loadProduct = async () => {
      try {
        console.log(`Fetching product with ID: ${id}`);
        // First get the product
        const productResponse = await api.get(`/seller/products/${id}`, {
          validateStatus: function (status) {
            return status >= 200 && status < 300; // default
          }
        });

        console.log('Product API Response:', productResponse);

        if (alive) {
          if (productResponse.data) {
            const productData = productResponse.data;

            // Normalize variants
            productData.variants = ensureArray(productData.variants);

            // Fallback: some older products might have variants stored under tags
            if (productData.variants.length === 0 && productData.tags) {
              const tags = recursiveParse(productData.tags);
              if (tags && typeof tags === 'object') {
                const tv = ensureArray(tags.variants);
                if (tv.length > 0) {
                  productData.variants = tv;
                }
              }
            }

            // If sellerId is available, fetch seller details
            if (productData.sellerId) {
              try {
                const sellerResponse = await api.get(`/users/${productData.sellerId}`);
                console.log('Seller API Response:', sellerResponse);
                productData.seller = sellerResponse.data;
              } catch (sellerError) {
                console.error('Error fetching seller details:', sellerError);
                // Continue even if seller fetch fails
                productData.seller = { error: 'Could not load seller details' };
              }
            }

            setProduct(productData);
            setError(null);
          } else {
            console.error('No data in response:', productResponse);
            setError('No product data received');
          }
        }
      } catch (err) {
        console.error('Error loading product:', {
          message: err.message,
          response: err.response,
          config: err.config,
          stack: err.stack
        });

        if (alive) {
          if (err.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            setError(err.response.data?.message || `Error: ${err.response.status} - ${err.response.statusText}`);
          } else if (err.request) {
            // The request was made but no response was received
            setError('No response from server. Please check your connection.');
          } else {
            // Something happened in setting up the request that triggered an Error
            setError(err.message || 'Failed to load product');
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadProduct();
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="p-0 sm:p-6">Loading product details...</div>;
  if (error) return <div className="p-0 sm:p-6 text-red-600">{error}</div>;
  if (!product) return <div className="p-0 sm:p-6">Product not found</div>;

  const images = product.images || [];
  const mainImage = images.length > 0 ? resolveImageUrl(images[0]) : '/placeholder.jpg';

  return (
    <div className="p-0 sm:p-6 w-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 leading-tight">Product Details</h1>
        <Link
          to="/dashboard/seller/products"
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
        >
          Back to Products
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="md:flex">
          {/* Product Images */}
          <div className="md:w-1/2 p-6">
            <div className="mb-4">
              <img
                src={mainImage}
                alt={product.name}
                className="w-full h-96 object-contain rounded"
              />
            </div>
            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {images.map((img, index) => (
                  <img
                    key={index}
                    src={resolveImageUrl(img)}
                    alt={`${product.name} ${index + 1}`}
                    className="w-full h-24 object-cover rounded border"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="md:w-1/2 p-6 border-l">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">{product.name}</h2>
              <div className="text-gray-600 mb-4">{product.description}</div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Status</h3>
                  <p className="mt-1">
                    {product.approved ? (
                      <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-800">Approved</span>
                    ) : product.reviewStatus === 'rejected' ? (
                      <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Rejected</span>
                    ) : product.reviewStatus === 'changes_requested' ? (
                      <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-800">Changes Requested</span>
                    ) : (
                      <span className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700">Pending Review</span>
                    )}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Price</h3>
                  <p className="mt-1 font-bold text-lg">KES {product.basePrice?.toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Stock</h3>
                  <p className="mt-1">{product.stock || 0} units</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">SKU</h3>
                  <p className="mt-1 font-mono">{product.sku || 'N/A'}</p>
                </div>
              </div>

              {product.reviewNotes && !product.approved && (
                <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400">
                  <h3 className="font-medium text-yellow-800">Admin Notes:</h3>
                  <p className="text-yellow-700">{product.reviewNotes}</p>
                </div>
              )}

              <div className="flex space-x-4 mt-6">
                <Link
                  to={`/seller/products/${product.id}/edit`}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Edit Product
                </Link>
              </div>
            </div>

            {/* Additional Details */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-4">Product Details</h3>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Category</h4>
                  <p>{product.Category?.name || 'N/A'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Created At</h4>
                  <p>{new Date(product.createdAt).toLocaleDateString()}</p>
                </div>
                {product.updatedAt && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500">Last Updated</h4>
                    <p>{new Date(product.updatedAt).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Product ID</h4>
                  <p>{product.id}</p>
                </div>
              </div>

              {/* Key Features */}
              {(() => {
                const features = deepUnwrapFeatures(product.keyFeatures || product.tags?.keyFeatures);
                if (!features.length) return null;
                return (
                  <div className="mt-6 border-t pt-6">
                    <h3 className="text-lg font-medium mb-3">Key Features</h3>
                    <ul className="space-y-2">
                      {features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-0.5 text-blue-600 font-bold flex-shrink-0">•</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              {/* Variants */}
              <div className="mt-8 border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Variants</h3>
                {Array.isArray(product.variants) && product.variants.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600">
                          <th className="py-2 pr-4">Variant Name</th>
                          <th className="py-2 pr-4">Variant Options</th>
                          <th className="py-2 pr-4">Base Price</th>
                          <th className="py-2 pr-4">Display Price</th>
                          <th className="py-2 pr-4">Disc %</th>
                          <th className="py-2 pr-4">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.flatMap((v, idx) => {
                          const variantName = (
                            v?.name || v?.variantName || v?.title || v?.sku ||
                            (v?.attributes ? Object.values(v.attributes).join(' / ') : '') ||
                            `Variant ${idx + 1}`
                          );

                          const basePrice = (v?.price ?? v?.basePrice ?? v?.amount ?? null);

                          // Helper to format KES
                          const fmt = (n) => (n != null && !isNaN(Number(n))) ? `KES ${Number(n).toLocaleString()}` : '-';

                          // 1) options as array
                          if (Array.isArray(v?.options) && v.options.length > 0) {
                            return v.options.map((o, oIdx) => {
                              // Primitive option values
                              const label = String(o);
                              const details = (v?.optionDetails && typeof v.optionDetails === 'object') ? (v.optionDetails[label] ?? v.optionDetails[String(oIdx)]) : undefined;

                              const rowBasePrice = details?.basePrice ?? basePrice;
                              const rowDisplayPrice = details?.displayPrice;
                              const rowDisc = details?.discountPercentage;
                              const rowStock = details?.stock;

                              return (
                                <tr key={`${idx}-opt-${oIdx}`} className="border-t">
                                  <td className="py-2 pr-4">{variantName}</td>
                                  <td className="py-2 pr-4">{label || '-'}</td>
                                  <td className="py-2 pr-4">{fmt(rowBasePrice)}</td>
                                  <td className="py-2 pr-4">{fmt(rowDisplayPrice)}</td>
                                  <td className="py-2 pr-4">{rowDisc ? `${rowDisc}%` : '-'}</td>
                                  <td className="py-2 pr-4">{rowStock != null ? rowStock : '-'}</td>
                                </tr>
                              );
                            });
                          }

                          // 2) options as object: { size: ['S','M'], color: ['Red','Blue'] }
                          if (v?.options && typeof v.options === 'object') {
                            const rows = [];
                            try {
                              for (const [key, arr] of Object.entries(v.options)) {
                                if (!Array.isArray(arr) || arr.length === 0) continue;
                                arr.forEach((val, oIdx) => {
                                  const label = `${key}: ${val}`;
                                  const details = (v?.optionDetails && typeof v.optionDetails === 'object') ? (v.optionDetails[val] ?? v.optionDetails[label]) : undefined;

                                  const rowBasePrice = details?.basePrice ?? basePrice;
                                  const rowDisplayPrice = details?.displayPrice;
                                  const rowDisc = details?.discountPercentage;
                                  const rowStock = details?.stock;

                                  rows.push(
                                    <tr key={`${idx}-${key}-${oIdx}`} className="border-t">
                                      <td className="py-2 pr-4">{variantName}</td>
                                      <td className="py-2 pr-4">{label}</td>
                                      <td className="py-2 pr-4">{fmt(rowBasePrice)}</td>
                                      <td className="py-2 pr-4">{fmt(rowDisplayPrice)}</td>
                                      <td className="py-2 pr-4">{rowDisc ? `${rowDisc}%` : '-'}</td>
                                      <td className="py-2 pr-4">{rowStock != null ? rowStock : '-'}</td>
                                    </tr>
                                  );
                                });
                              }
                            } catch (_) { }
                            if (rows.length > 0) return rows;
                          }

                          // 3) Fallback: attributes object -> single row
                          let optionsStr = '';
                          if (v?.attributes && typeof v.attributes === 'object') {
                            try {
                              optionsStr = Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ');
                            } catch (_) { optionsStr = ''; }
                          }
                          return (
                            <tr key={idx} className="border-t">
                              <td className="py-2 pr-4">{variantName}</td>
                              <td className="py-2 pr-4">{optionsStr || '-'}</td>
                              <td className="py-2 pr-4">{fmt(basePrice)}</td>
                              <td className="py-2 pr-4">-</td>
                              <td className="py-2 pr-4">-</td>
                              <td className="py-2 pr-4">-</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">No variants added for this product.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SellerProductView;
