import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import SellerProviderSelector from './components/SellerProviderSelector';
import ComradesProductForm from './comrades/ComradesProductForm';
import FastFoodForm from './FastFoodForm';
import ServiceForm from '../../components/services/ServiceForm';
import AdminCreatedItemsTable from './components/AdminCreatedItemsTable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ui/use-toast';

const AdminOnBehalfCreation = () => {
    const [selectedEntity, setSelectedEntity] = useState(null);
    const [activeTab, setActiveTab] = useState('product');
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleSuccess = (isEdit) => {
        toast({
            title: "Success!",
            description: `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} created and approved successfully.`,
            variant: "default",
        });
        // Reset selection to allow creating another one
        setSelectedEntity(null);
    };

    const handleTabChange = (value) => {
        setActiveTab(value);
        // Clear selection when changing tabs to ensure correct user type is selected
        setSelectedEntity(null);
    };

    return (
        <div className="container mx-auto p-2 sm:p-6 space-y-6 max-w-7xl">
            <header className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <span className="bg-blue-100 p-2 rounded-lg text-blue-600">🛡️</span>
                        Admin On-Behalf Creation
                    </h1>
                    <p className="text-gray-500 mt-1 font-medium italic">Create and instantly approve items for vendors</p>
                </div>
                <div className="flex gap-2">
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider flex items-center">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                        Admin Mode
                    </span>
                </div>
            </header>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-4 h-16 p-1.5 bg-gray-100/80 backdrop-blur rounded-2xl shadow-inner border border-gray-200 mb-6">
                    <TabsTrigger 
                        value="product" 
                        className="rounded-xl font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-lg transition-all"
                    >
                        <span className="mr-2">📦</span> General
                    </TabsTrigger>
                    <TabsTrigger 
                        value="fastfood" 
                        className="rounded-xl font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-lg transition-all"
                    >
                        <span className="mr-2">🍔</span> Fast Food
                    </TabsTrigger>
                    <TabsTrigger 
                        value="service" 
                        className="rounded-xl font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-lg transition-all"
                    >
                        <span className="mr-2">🛠️</span> Service
                    </TabsTrigger>
                    <TabsTrigger 
                        value="history" 
                        className="rounded-xl font-bold text-sm data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-lg transition-all"
                    >
                        <span className="mr-2">📋</span> History
                    </TabsTrigger>
                </TabsList>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Side: Instructions & User Type Selection */}
                    {activeTab !== 'history' && (
                    <div className="lg:col-span-4 space-y-6">
                        <Card className="border-none shadow-xl bg-gradient-to-br from-gray-900 to-gray-800 text-white overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <span className="text-blue-400">💡</span>
                                    How it works
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 text-gray-300 text-sm">
                                <div className="flex gap-3">
                                    <span className="bg-blue-500/20 text-blue-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold">1</span>
                                    <p>Select the <strong>type of item</strong> you want to create using the tabs.</p>
                                </div>
                                <div className="flex gap-3">
                                    <span className="bg-blue-500/20 text-blue-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold">2</span>
                                    <p>Search and select the <strong>target vendor</strong> who will own the item.</p>
                                </div>
                                <div className="flex gap-3">
                                    <span className="bg-blue-500/20 text-blue-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold">3</span>
                                    <p>Fill the form. The item will be <strong>active and approved</strong> instantly.</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-lg bg-white">
                            <CardHeader className="pb-3 border-b">
                                <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    🎯 Step 1: Select Vendor
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <SellerProviderSelector 
                                    onSelect={setSelectedEntity} 
                                    type={activeTab === 'service' ? 'provider' : 'seller'}
                                />
                                
                                {selectedEntity && (
                                    <div className="mt-6 p-4 bg-blue-50 border-2 border-blue-100 rounded-2xl animate-in zoom-in-95 duration-300">
                                        <div className="flex items-start justify-between">
                                            <div className="flex gap-3">
                                                <div className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg">
                                                    {selectedEntity.name?.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-blue-900 leading-tight">{selectedEntity.name}</p>
                                                    <p className="text-xs text-blue-600 truncate max-w-[150px]">{selectedEntity.email}</p>
                                                    <div className="mt-1 flex gap-1">
                                                        <span className="px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded text-[9px] font-black uppercase">
                                                            {selectedEntity.role}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => setSelectedEntity(null)}
                                                className="text-gray-400 hover:text-red-500 transition-colors"
                                                title="Clear Selection"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                    )}

                    {/* Right Side: Form Content or Table */}
                    <div className={activeTab === 'history' ? 'lg:col-span-12' : 'lg:col-span-8'}>
                        <div className="mt-0">
                            {activeTab === 'history' ? (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <TabsContent value="history" className="m-0 focus-visible:outline-none">
                                        <AdminCreatedItemsTable />
                                    </TabsContent>
                                </div>
                            ) : selectedEntity ? (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <TabsContent value="product" className="m-0 focus-visible:outline-none">
                                        <ComradesProductForm 
                                            onSuccess={handleSuccess} 
                                            forcedSellerId={selectedEntity.id}
                                            mode="create"
                                        />
                                    </TabsContent>
                                    <TabsContent value="fastfood" className="m-0 focus-visible:outline-none">
                                        <FastFoodForm 
                                            onSuccess={handleSuccess} 
                                            forcedVendorId={selectedEntity.id}
                                            mode="create"
                                        />
                                    </TabsContent>
                                    <TabsContent value="service" className="m-0 focus-visible:outline-none">
                                        <ServiceForm 
                                            onSuccess={handleSuccess} 
                                            forcedProviderId={selectedEntity.id}
                                            mode="create"
                                        />
                                    </TabsContent>
                                </div>
                            ) : (
                                <div className="bg-white rounded-3xl border-2 border-dashed border-gray-200 p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-4xl">
                                        🔍
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-800">Assign a {activeTab === 'service' ? 'Provider' : 'Vendor'} First</h3>
                                    <p className="text-gray-500 mt-2 max-w-sm mx-auto">
                                        Use the selection panel on the left to find a {activeTab === 'service' ? 'service provider' : 'seller'} to create this {activeTab} for.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Tabs>
        </div>
    );
};

export default AdminOnBehalfCreation;
