import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { usePlatform } from '../../contexts/PlatformContext';

const PageLayout = ({ children, title, description, fluid = false }) => {
  const { settings } = usePlatform();
  
  const siteName = settings.platform?.siteName || 'Comrades360';
  const defaultDescription = settings.seo?.description || 'Your one-stop e-commerce destination';
  
  const pageTitle = title ? `${title} | ${siteName}` : siteName;
  const pageDescription = description || defaultDescription;

  // Preload critical assets
  useEffect(() => {
    // Preload web fonts if any
    const fontPreload = document.createElement('link');
    fontPreload.rel = 'preconnect';
    fontPreload.href = 'https://fonts.googleapis.com';
    document.head.appendChild(fontPreload);

    return () => {
      document.head.removeChild(fontPreload);
    };
  }, []);

  return (
    <div className="page-container">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />


        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://api.comrades360.com" />
        <link rel="dns-prefetch" href="https://api.comrades360.com" />

        {/* Performance optimizations */}
        <meta httpEquiv="x-ua-compatible" content="ie=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

        {/* Preload critical CSS */}
        <style>
          {`
            /* Critical CSS - Loads before any other styles */
            html { box-sizing: border-box; }
            *, *:before, *:after { box-sizing: inherit; }
            body { 
              margin: 0; 
              padding: 0; 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              line-height: 1.5;
              color: #1a202c;
            }
            .page-container {
              min-height: 100vh;
              display: flex;
              flex-direction: column;
            }
            .page-content {
              flex: 1;
              max-width: ${fluid ? 'none' : '1440px'};
              width: 100%;
              margin: ${fluid ? '0' : '0 auto'};
              padding: ${fluid ? '0' : '0 1rem'};
            }
            
            /* Skeleton loading animation */
            @keyframes shimmer {
              0% { background-position: -1000px 0; }
              100% { background-position: 1000px 0; }
            }
            .skeleton {
              background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
              background-size: 1000px 100%;
              animation: shimmer 2s infinite linear;
            }
          `}
        </style>
      </Helmet>

      <main className="page-content">
        {children}
      </main>
    </div>
  );
};

export default PageLayout;
