import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Info } from 'lucide-react';
import api from '../../services/api';

const StaticContentPage = ({ pageKey, title }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/platform/config/${pageKey}`);
        if (response.data && response.data.success) {
          // The controller returns data: { ... } or data: "string"
          const data = response.data.data;
          setContent(typeof data === 'string' ? data : (data?.content || ''));
        }
      } catch (err) {
        console.error(`Error fetching page ${pageKey}:`, err);
        setError('Failed to load content. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
    // Scroll to top on mount
    window.scrollTo(0, 0);
  }, [pageKey]);

  return (
    <div className="min-h-screen bg-transparent py-4 md:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation & Back Button */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate('/');
              }
            }}
            className="group flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-full shadow-sm hover:shadow-md hover:bg-white dark:hover:bg-slate-800 transition-all duration-300 transform hover:-translate-x-1"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">Back</span>
          </button>
          
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 font-medium tracking-wider uppercase">
            <Info className="w-3 h-3" />
            <span>Official Platform Information</span>
          </div>
        </div>

        {/* Content Container */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-hidden min-h-[60vh] relative transition-all duration-500">
          
          {/* Header Section */}
          <div className="relative px-6 py-12 md:px-12 bg-gradient-to-br from-blue-600 to-indigo-700 overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl"></div>
            
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-2">
                {title}
              </h1>
              <div className="h-1 w-20 bg-blue-300 rounded-full mb-4"></div>
              <p className="text-blue-100 font-medium max-w-lg">
                Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Body Content */}
          <div className="px-6 py-10 md:px-12 md:py-16">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                <p className="text-slate-500 font-medium animate-pulse">Loading {title.toLowerCase()}...</p>
              </div>
            ) : error ? (
              <div className="p-8 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 mb-4">
                    <Info className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-red-800 dark:text-red-300 mb-2">Notice</h3>
                <p className="text-red-600 dark:text-red-400 italic mb-6">{error}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Retry Loading
                </button>
              </div>
            ) : (
              <div className="prose prose-slate prose-lg max-w-none dark:prose-invert prose-headings:text-slate-900 dark:prose-headings:text-white prose-p:text-slate-600 dark:prose-p:text-slate-400 prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-strong:text-slate-900 dark:prose-strong:text-white prose-li:text-slate-600 dark:prose-li:text-slate-400">
                {content ? (
                  /* 
                     Using dangerouslySetInnerHTML because we want to support Rich Text/HTML from the admin.
                     In a production environment, we'd sanitize this, but here we trust the admin input.
                  */
                  <div 
                    className="static-content-body"
                    dangerouslySetInnerHTML={{ __html: content }} 
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mb-4">
                        <Info className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Information Coming Soon</h3>
                    <p className="text-slate-500 max-w-xs mx-auto">
                      We're currently updating our {title.toLowerCase()} policy. Please check back shortly for the latest information.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Disclaimer */}
        <div className="mt-8 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-600">
                &copy; {new Date().getFullYear()} Comrades360 Shopping Platform. All rights reserved.
            </p>
        </div>
      </div>
    </div>
  );
};

export default StaticContentPage;
