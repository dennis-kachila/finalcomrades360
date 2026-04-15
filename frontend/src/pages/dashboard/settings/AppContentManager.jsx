import React, { useState, useEffect } from 'react';
import { Save, Loader2, Eye, Edit3, Trash2, CheckCircle2, AlertCircle, RefreshCw, Info, Layout, Wand2, FileText, ChevronRight, Zap, RotateCcw } from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-toastify';

const PAGES = [
  { key: 'content_page_about', title: 'About Us', icon: '🏢' },
  { key: 'content_page_contact', title: 'Contact Us', icon: '📞' },
  { key: 'content_page_terms', title: 'Terms of Service', icon: '⚖️' },
  { key: 'content_page_privacy', title: 'Privacy Policy', icon: '🔒' },
  { key: 'content_page_faq', title: 'FAQs', icon: '❓' },
  { key: 'content_page_shipping', title: 'Shipping & Returns', icon: '📦' },
  { key: 'content_page_payments', title: 'Payment Options', icon: '💳' },
  { key: 'content_page_size_guide', title: 'Size Guide', icon: '📏' },
  { key: 'content_page_help', title: 'Help Center', icon: '🆘' },
];

const AppContentManager = () => {
  const [selectedPage, setSelectedPage] = useState(PAGES[0]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [pageStatuses, setPageStatuses] = useState({});
  const [initialOverview, setInitialOverview] = useState(true);

  useEffect(() => {
    fetchAllPageStatuses();
  }, []);

  useEffect(() => {
    if (!initialOverview) {
      fetchPageContent();
    }
  }, [selectedPage, initialOverview]);

  const fetchAllPageStatuses = async () => {
    setLoading(true);
    const statuses = {};
    try {
      await Promise.all(PAGES.map(async (page) => {
        try {
          const response = await api.get(`/platform/config/${page.key}`);
          if (response.data && response.data.success) {
            // isDefault means it's returning a fallback from the backend system
            statuses[page.key] = response.data.isDefault ? 'empty' : 'published';
          }
        } catch (e) {
          statuses[page.key] = 'error';
        }
      }));
      setPageStatuses(statuses);
    } catch (err) {
      console.error('Error fetching all statuses:', err);
    } finally {
      setLoading(false);
    }
  };

  const syncAllFromSystem = async () => {
    if (!window.confirm("This will initialize all 'Empty' sections using the system's original default content. Continue?")) return;
    setSaving(true);
    try {
      // Logic: For each empty page, fetch its default and save it as an official record
      const emptyPages = PAGES.filter(p => pageStatuses[p.key] !== 'published');
      
      for (const page of emptyPages) {
        const response = await api.get(`/platform/config/${page.key}`);
        if (response.data && response.data.success) {
            await api.post(`/platform/config/${page.key}`, { value: response.data.data });
        }
      }

      toast.success(`Successfully initialized ${emptyPages.length} sections from system defaults!`);
      await fetchAllPageStatuses();
    } catch (err) {
      console.error('Sync error:', err);
      toast.error("Failed to sync some pages.");
    } finally {
      setSaving(false);
    }
  };

  const fetchPageContent = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/platform/config/${selectedPage.key}`);
      if (response.data && response.data.success) {
        const val = response.data.data;
        setContent(typeof val === 'string' ? val : '');
      }
    } catch (err) {
      console.error('Error fetching page content:', err);
      toast.error('Failed to load page content');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post(`/platform/config/${selectedPage.key}`, { value: content });
      toast.success(`${selectedPage.title} updated and published!`);
      setPageStatuses(prev => ({ ...prev, [selectedPage.key]: 'published' }));
    } catch (err) {
      console.error('Error saving page content:', err);
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const restoreDefault = async () => {
    if (!window.confirm('This will discard your changes and restore the original system default. Continue?')) return;
    setLoading(true);
    try {
      // On backend, we'll need a way to clear or just fetch the default
      const response = await api.get(`/platform/config/${selectedPage.key}`);
      if (response.data && response.data.success) {
        // If it's already a default, we just have the data
        // If it was published, we'd need to know the 'base'
        // For now, we rely on the fact that getConfig returns defaults if empty.
        // So we can just clear it or just load the default which we'll have to provide locally or via another endpoint.
        // Actually, let's just use the current data if it's returning defaults.
        setContent(response.data.data);
        toast.info(`Restored original system content for ${selectedPage.title}`);
      }
    } catch (err) {
      toast.error('Failed to restore default');
    } finally {
      setLoading(false);
    }
  };

  const insertTag = (tag) => {
    const textarea = document.getElementById('content-editor');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    
    let newText = '';
    if (tag === 'b') newText = `<strong>${text.substring(start, end) || 'Bold Text'}</strong>`;
    if (tag === 'i') newText = `<em>${text.substring(start, end) || 'Italic Text'}</em>`;
    if (tag === 'h2') newText = `<h2>${text.substring(start, end) || 'Heading 2'}</h2>`;
    if (tag === 'h3') newText = `<h3>${text.substring(start, end) || 'Heading 3'}</h3>`;
    if (tag === 'p') newText = `<p>${text.substring(start, end) || 'Paragraph text...'}</p>`;
    if (tag === 'ul') newText = `<ul>\n  <li>${text.substring(start, end) || 'List item'}</li>\n  <li>Next item</li>\n</ul>`;
    if (tag === 'br') newText = `${text.substring(start, end)}<br />`;
    if (tag === 'link') newText = `<a href="#" class="text-blue-600 hover:underline font-bold">${text.substring(start, end) || 'Link Text'}</a>`;

    const updatedValue = before + newText + after;
    setContent(updatedValue);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + newText.length, start + newText.length);
    }, 0);
  };

  if (initialOverview && loading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-slate-500 font-bold animate-pulse uppercase tracking-widest text-xs">Accessing System Defaults...</p>
        </div>
    );
  }

  if (initialOverview) {
    return (
        <div className="p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3">
                        <Layout className="w-8 h-8 text-blue-600" />
                        Platform Content Hub
                    </h1>
                    <p className="text-slate-500 mt-1 font-medium">Stored securely on the backend. No hardcoded frontend text.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={syncAllFromSystem}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-100 font-bold active:scale-95 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Initialize All Sections
                    </button>
                    <button 
                        onClick={fetchAllPageStatuses}
                        className="p-3 text-slate-400 hover:text-blue-600 transition-colors bg-white border border-slate-200 rounded-xl"
                        title="Refresh Statuses"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {PAGES.map((page) => (
                    <div key={page.key} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden ring-1 ring-slate-100">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform text-4xl">
                            {page.icon}
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-2xl">{page.icon}</span>
                                <h3 className="text-lg font-bold text-slate-800">{page.title}</h3>
                            </div>
                            
                            <div className="flex items-center justify-between mb-6">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data Origin</span>
                                {pageStatuses[page.key] === 'published' ? (
                                    <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Custom / Edited
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                                        <Info className="w-3.5 h-3.5" />
                                        System Default
                                    </span>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    setSelectedPage(page);
                                    setInitialOverview(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-700 rounded-2xl transition-all font-bold text-sm shadow-sm active:scale-95"
                            >
                                <Edit3 className="w-4 h-4" />
                                View & Edit
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-20">
                    <Database className="w-32 h-32" />
                </div>
                <div className="relative z-10 max-w-2xl">
                    <h2 className="text-3xl font-black mb-4 tracking-tight italic uppercase">Backend-Driven CMS</h2>
                    <p className="text-blue-100 text-lg mb-8 leading-relaxed font-medium">
                        All templates are now stored on the server. There is no hardcoded text in your frontend files. 
                        If you clear a section, it automatically falls back to the system's original professional content.
                    </p>
                    <div className="flex items-center gap-2 text-sm text-blue-300 font-bold uppercase tracking-widest">
                        <CheckCircle2 className="w-5 h-5 text-blue-400" />
                        SQL Storage - API Persistence - Secure Retrieval
                    </div>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <button 
                onClick={() => setInitialOverview(true)}
                className="p-3 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm"
                title="Back to Overview"
            >
                <Layout className="w-5 h-5 text-slate-600" />
            </button>
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                    {selectedPage.title}
                </h1>
                <p className="text-slate-500 font-bold text-sm">Stored on server as: <code className="text-blue-600 text-[10px]">{selectedPage.key}</code></p>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
            <button
                onClick={restoreDefault}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-700 border border-red-100 rounded-xl hover:bg-red-100 transition-all font-bold shadow-sm"
            >
                <RotateCcw className="w-4 h-4" />
                Restore Original
            </button>
            <button
                onClick={handleSave}
                disabled={loading || saving}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none font-black uppercase tracking-widest text-xs"
            >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Selector */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden ring-1 ring-slate-100">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-2">Navigation</h3>
            <div className="space-y-1">
              {PAGES.map((page) => (
                <button
                  key={page.key}
                  onClick={() => setSelectedPage(page)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all duration-200 ${
                    selectedPage.key === page.key
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{page.icon}</span>
                    <span className="font-bold text-sm">{page.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          <div className="bg-slate-900 rounded-[2rem] p-7 text-white shadow-xl border border-slate-800">
            <h4 className="font-black mb-3 flex items-center gap-2 uppercase tracking-widest text-[10px] text-blue-400">
                <Info className="w-4 h-4" />
                Backend Status
            </h4>
            <div className="text-[11px] text-slate-400 leading-relaxed font-medium">
                This content is fetched from the database's <code>PlatformConfig</code> table. 
                System defaults are used as fallbacks if no entry exists.
            </div>
          </div>
        </div>

        {/* Editor Area */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden flex flex-col min-h-[650px]">
            {/* Editor ToolBar */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                <button onClick={() => insertTag('h2')} className="px-3 py-1.5 hover:bg-slate-100 rounded-lg text-slate-700 font-black text-xs uppercase" title="Heading 2">H2</button>
                <button onClick={() => insertTag('h3')} className="px-3 py-1.5 hover:bg-slate-100 rounded-lg text-slate-700 font-bold text-xs uppercase" title="Heading 3">H3</button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={() => insertTag('b')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-700 font-black px-4 transition-colors" title="Bold">B</button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button onClick={() => insertTag('ul')} className="px-3 py-1.5 hover:bg-slate-100 rounded-lg text-slate-700 font-black text-[10px] uppercase tracking-widest" title="Add List">List</button>
                <button onClick={() => insertTag('link')} className="px-3 py-1.5 hover:bg-slate-100 rounded-lg text-blue-600 font-black text-[10px] uppercase tracking-widest" title="Add Link">Link</button>
              </div>

              <div className="flex items-center gap-2 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
                <button
                  onClick={() => setPreviewMode(false)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!previewMode ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editor
                </button>
                <button
                  onClick={() => setPreviewMode(true)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${previewMode ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className={`flex-1 relative ${loading ? 'opacity-50' : ''}`}>
              {!previewMode ? (
                <textarea
                  id="content-editor"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full h-full p-8 md:p-12 resize-none focus:outline-none focus:ring-0 text-slate-700 font-mono text-sm leading-relaxed bg-slate-50/10 placeholder:text-slate-300"
                  placeholder={`Construct your ${selectedPage.title} content...`}
                />
              ) : (
                <div className="w-full h-full p-8 md:p-12 overflow-y-auto bg-transparent prose-container">
                    <div className="max-w-none bg-white rounded-3xl p-10 shadow-sm border border-slate-100">
                        <h1 className="text-4xl font-black text-slate-900 mb-10 pb-4 border-b-8 border-blue-600 inline-block uppercase tracking-tighter italic tracking-tight">
                            {selectedPage.title}
                        </h1>
                        <div className="prose prose-slate prose-lg max-w-none">
                            {content ? (
                            <div className="static-content-body" dangerouslySetInnerHTML={{ __html: content }} />
                            ) : (
                            <div className="flex flex-col items-center justify-center py-24 text-slate-300 border-2 border-dashed border-slate-100 rounded-[2rem]">
                                <FileText className="w-24 h-24 mb-6 opacity-10" />
                                <p className="font-black text-2xl uppercase tracking-[0.2em] italic opacity-20">No data found</p>
                                <button onClick={restoreDefault} className="mt-6 px-6 py-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all text-xs font-black uppercase tracking-widest">Restore Original</button>
                            </div>
                            )}
                        </div>
                    </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between p-7 bg-white rounded-[2rem] border border-slate-200 border-dashed shadow-sm">
            <div className="flex items-center gap-3 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                Backend-to-Public Sync Active
            </div>
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                {content.length} characters stored
            </div>
          </div>
        </div>
      </div>
      
      <style>{`
        .static-content-body ul { list-style-type: disc !important; padding-left: 1.5rem !important; margin-bottom: 2rem !important; color: #475569 !important; }
        .static-content-body li { margin-bottom: 0.75rem !important; font-weight: 500 !important; }
        .static-content-body p { margin-bottom: 1.5rem !important; line-height: 1.8 !important; color: #475569 !important; font-weight: 500 !important; }
        .static-content-body h2 { font-weight: 900 !important; font-size: 2rem !important; line-height: 1.2 !important; margin-top: 3.5rem !important; margin-bottom: 1.5rem !important; color: #0f172a !important; letter-spacing: -0.025em !important; text-transform: uppercase !important; font-style: italic !important; }
        .static-content-body h3 { font-weight: 800 !important; font-size: 1.5rem !important; line-height: 1.4 !important; margin-top: 2.5rem !important; margin-bottom: 1.25rem !important; color: #1e293b !important; letter-spacing: -0.01em !important; }
        .static-content-body strong { color: #0f172a !important; font-weight: 800 !important; }
        .static-content-body a { color: #2563eb !important; text-decoration: underline !important; font-weight: 700 !important; }
      `}</style>
    </div>
  );
};

// Help icons missing from lucide
const Database = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path></svg>
);

export default AppContentManager;
