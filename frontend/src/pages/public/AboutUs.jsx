import React from 'react';
import { Helmet } from 'react-helmet-async';

export default function AboutUs() {
  return (
    <>
      <Helmet>
        <title>About Us | Comrades360</title>
        <meta name="description" content="Learn more about Comrades360, your ultimate student marketplace." />
      </Helmet>
      
      <div className="bg-white">
        {/* Hero Section */}
        <div className="bg-blue-600 text-white py-16 md:py-24">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">About Comrades360</h1>
            <p className="text-lg md:text-xl text-blue-100">
              Empowering students through commerce, connection, and convenience.
            </p>
          </div>
        </div>

        {/* Content Section */}
        <div className="container mx-auto px-4 py-12 md:py-20 max-w-4xl">
          <div className="prose prose-blue prose-lg max-w-none text-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Story</h2>
            <p className="mb-6">
              Comrades360 was founded by students, for students. We understand the unique challenges of campus life, 
              from tight budgets to busy schedules. We saw a need for a unified platform where students could easily 
              buy, sell, and discover goods and services securely within their campus ecosystem.
            </p>
            
            <p className="mb-8">
              What started as an idea in a dorm room has evolved into a comprehensive digital marketplace. 
              Our goal has always been simple: create a trusted environment where "comrades" can thrive together.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Mission</h2>
            <p className="mb-8">
              To build a seamless, secure, and vibrant digital marketplace that connects university students 
              with local vendors, fellow student entrepreneurs, and essential services in real-time.
            </p>

            <h2 className="text-2xl font-bold text-gray-900 mb-6">Why Choose Us?</h2>
            <div className="grid md:grid-cols-3 gap-8 mt-8">
              <div className="border border-gray-100 bg-gray-50 p-6 rounded-xl text-center">
                <div className="text-blue-600 text-3xl mb-4">🛡️</div>
                <h3 className="font-bold text-gray-900 mb-2">Secure</h3>
                <p className="text-sm text-gray-600">Verified student and seller profiles ensure a trusted community.</p>
              </div>
              <div className="border border-gray-100 bg-gray-50 p-6 rounded-xl text-center">
                <div className="text-blue-600 text-3xl mb-4">🎓</div>
                <h3 className="font-bold text-gray-900 mb-2">By Students</h3>
                <p className="text-sm text-gray-600">Tailored specifically to the needs and rhythms of university life.</p>
              </div>
              <div className="border border-gray-100 bg-gray-50 p-6 rounded-xl text-center">
                <div className="text-blue-600 text-3xl mb-4">🚀</div>
                <h3 className="font-bold text-gray-900 mb-2">Fast</h3>
                <p className="text-sm text-gray-600">Ultra-fast delivery and real-time communication with sellers.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
