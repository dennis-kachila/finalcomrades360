import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function SizeGuide() {
  return (
    <>
      <Helmet>
        <title>Size Guide | Comrades360</title>
      </Helmet>

      <div className="bg-white py-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Clothing Size Guide</h1>
            <p className="text-lg text-gray-600">Ensure the perfect fit! Use our general sizing charts below when buying from campus thrifters or boutique sellers.</p>
          </div>
          
          <div className="prose prose-blue max-w-none text-gray-700">
            <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mb-8 text-blue-900 rounded-r-lg">
              <strong>Note:</strong> Sizes vary depending on the brand and the seller's source. Always read the seller's specific product description for exact measurements before purchasing.
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Women's Sizing</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left border-collapse border border-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-200 px-4 py-2 font-bold text-gray-800">Size</th>
                    <th className="border border-gray-200 px-4 py-2 font-bold text-gray-800">UK Size</th>
                    <th className="border border-gray-200 px-4 py-2 font-bold text-gray-800">Bust (inches)</th>
                    <th className="border border-gray-200 px-4 py-2 font-bold text-gray-800">Waist (inches)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="border border-gray-200 px-4 py-2">Small (S)</td><td className="border border-gray-200 px-4 py-2">8 - 10</td><td className="border border-gray-200 px-4 py-2">32 - 34</td><td className="border border-gray-200 px-4 py-2">26 - 28</td></tr>
                  <tr className="bg-gray-50"><td className="border border-gray-200 px-4 py-2">Medium (M)</td><td className="border border-gray-200 px-4 py-2">12 - 14</td><td className="border border-gray-200 px-4 py-2">36 - 38</td><td className="border border-gray-200 px-4 py-2">30 - 32</td></tr>
                  <tr><td className="border border-gray-200 px-4 py-2">Large (L)</td><td className="border border-gray-200 px-4 py-2">16</td><td className="border border-gray-200 px-4 py-2">40</td><td className="border border-gray-200 px-4 py-2">34</td></tr>
                  <tr className="bg-gray-50"><td className="border border-gray-200 px-4 py-2">X-Large (XL)</td><td className="border border-gray-200 px-4 py-2">18</td><td className="border border-gray-200 px-4 py-2">42</td><td className="border border-gray-200 px-4 py-2">36</td></tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">Men's Sizing</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left border-collapse border border-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-200 px-4 py-2 font-bold text-gray-800">Size</th>
                    <th className="border border-gray-200 px-4 py-2 font-bold text-gray-800">Chest (inches)</th>
                    <th className="border border-gray-200 px-4 py-2 font-bold text-gray-800">Waist (inches)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="border border-gray-200 px-4 py-2">Small (S)</td><td className="border border-gray-200 px-4 py-2">34 - 36</td><td className="border border-gray-200 px-4 py-2">28 - 30</td></tr>
                  <tr className="bg-gray-50"><td className="border border-gray-200 px-4 py-2">Medium (M)</td><td className="border border-gray-200 px-4 py-2">38 - 40</td><td className="border border-gray-200 px-4 py-2">32 - 34</td></tr>
                  <tr><td className="border border-gray-200 px-4 py-2">Large (L)</td><td className="border border-gray-200 px-4 py-2">42 - 44</td><td className="border border-gray-200 px-4 py-2">36 - 38</td></tr>
                  <tr className="bg-gray-50"><td className="border border-gray-200 px-4 py-2">X-Large (XL)</td><td className="border border-gray-200 px-4 py-2">46 - 48</td><td className="border border-gray-200 px-4 py-2">40 - 42</td></tr>
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
