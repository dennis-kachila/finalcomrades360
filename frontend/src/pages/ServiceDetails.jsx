import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Star, Clock, MapPin, Shield, Share2, Heart, ArrowLeft, Phone, Mail, CheckCircle, Calendar, Link as LinkIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useToast } from '../components/ui/use-toast';

import serviceApi from '../services/serviceApi';
import { resolveImageUrl, getResizedImageUrl } from '../utils/imageUtils';
import Footer from '../components/Footer';
import { usePersistentFetch } from '../hooks/usePersistentFetch';

const ServiceDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const [service, setService] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeImage, setActiveImage] = useState(null);

    // Instant Loading Implementation
    const { data: fetchedService, loading: hookLoading, error: hookError } = usePersistentFetch(
        `service_detail_${id}`,
        () => serviceApi.getServiceById(id),
        { staleTime: 10 * 60 * 1000 }
    );

    useEffect(() => {
        if (fetchedService) {
            setService(fetchedService);
            // Always update active image for the new service
            setActiveImage(fetchedService.images?.[0] || fetchedService.coverImage || null);
            setLoading(false);
        } else if (hookLoading) {
            setLoading(true);
        }

        if (hookError) {
            toast({ title: 'Error', description: 'Failed to load service data.', variant: 'destructive' });
            setLoading(false);
        }
    }, [fetchedService, hookLoading, hookError, toast]);



    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!service) return null;

    // Standardized robust discount calculation
    const pBase = Number(service.basePrice || service.price || 0);
    const pDisplay = Number(service.displayPrice || 0);
    const pDiscount = Number(service.discountPrice || 0);
    const pPct = Number(service.discountPercentage || 0);
    const pFallback = Number(service.price || 0);

    let originalPrice = 0;
    if (pDisplay > 0 && pBase > 0) {
        originalPrice = Math.max(pDisplay, pBase);
    } else {
        originalPrice = pDisplay > 0 ? pDisplay : (pBase > 0 ? pBase : pFallback);
    }

    let finalPrice = (pDisplay > 0 && pBase > 0 && pDisplay < pBase) ? pDisplay : originalPrice;

    if (pDiscount > 0 && pDiscount < finalPrice) {
        finalPrice = pDiscount;
    }

    if (pPct > 0) {
        const pctPrice = originalPrice * (1 - pPct / 100);
        if (pctPrice < finalPrice) finalPrice = pctPrice;
    }

    let discountPercentage = pPct;
    if (finalPrice < originalPrice && originalPrice > 0) {
        const calculatedPct = Math.round(((originalPrice - finalPrice) / originalPrice) * 100);
        discountPercentage = calculatedPct > 0 ? calculatedPct : discountPercentage;
    } else {
        discountPercentage = 0;
    }

    const hasDiscount = discountPercentage > 0 && finalPrice < originalPrice;

    return (
        <div className="min-h-screen bg-gray-50 pt-20">
            <div className="container mx-auto px-0 md:px-4 py-8">
                <button
                    onClick={() => {
                        if (location.state?.from) {
                            navigate(-1);
                            return;
                        }
                        if (window.history.length > 1) {
                            navigate(-1);
                            return;
                        }
                        if (localStorage.getItem('marketing_mode') === 'true') {
                            navigate('/marketing');
                        } else {
                            navigate('/services');
                        }
                    }}
                    className="flex items-center text-gray-600 hover:text-blue-600 mb-6 transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    {(() => {
                        const fromPath = location.state?.from;
                        const isMarketing = localStorage.getItem('marketing_mode') === 'true';
                        if (fromPath) {
                            const segments = fromPath.split('/').filter(Boolean);
                            if (segments.length > 1) return 'Back to Item';
                            if (segments.length === 0) return 'Back to Home';
                        }
                        return isMarketing ? 'Back to Marketing' : 'Back to Services';
                    })()}
                </button>

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 lg:p-10">
                        {/* Gallery */}
                        <div className="space-y-4">
                            <div className="aspect-video rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                                <img
                                    src={getResizedImageUrl(resolveImageUrl(activeImage), { width: 800, quality: 80 })}
                                    alt={service.title}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            {service.images && service.images.length > 0 && (
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                    {service.images.map((img, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setActiveImage(img)}
                                            className={`flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${activeImage === img ? 'border-blue-600 shadow-md' : 'border-transparent hover:border-gray-300'}`}
                                        >
                                            <img src={getResizedImageUrl(resolveImageUrl(img), { width: 800, quality: 80 })} alt={`Gallery ${index}`} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="flex flex-col">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{service.title}</h1>
                                    <div className="flex items-center gap-4 mb-4">
                                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                                            {service.subcategory?.name || 'Professional Service'}
                                        </span>
                                        <div className="flex items-center text-amber-500">
                                            <Star className="h-4 w-4 fill-current" />
                                            <span className="ml-1 text-gray-700 font-medium">4.9</span>
                                            <span className="ml-1 text-gray-400 text-sm">(45+ reviews)</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button className="p-2 rounded-full bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                                        <Share2 className="h-5 w-5" />
                                    </button>
                                    <button className="p-2 rounded-full bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                                        <Heart className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-gray-600 mb-6">
                                <MapPin className="h-4 w-4" />
                                <span>{service.location || 'Nairobi, Kenya'}</span>
                                <span className="mx-2">•</span>
                                <Clock className="h-4 w-4" />
                                <span>Available Now</span>
                            </div>

                            <div className="prose prose-sm max-w-none text-gray-600 mb-8">
                                <p className="whitespace-pre-line">{service.description}</p>
                            </div>

                            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 mb-8">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-gray-600 font-medium">Starting from</span>
                                    <span className="text-3xl font-bold text-blue-600">KES {finalPrice.toLocaleString()}</span>
                                </div>
                                {hasDiscount && (
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="text-gray-400 line-through">KES {originalPrice.toLocaleString()}</span>
                                        <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs font-bold">-{discountPercentage}%</span>
                                    </div>
                                )}
                                <Button
                                    disabled={true}
                                    className="w-full h-12 text-lg font-bold shadow-lg shadow-gray-100 transition-all bg-gray-300 text-gray-500 cursor-not-allowed"
                                >
                                    Booking Coming Soon
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
                    {/* Provider Card */}
                    <div className="lg:col-span-1">
                        <div id="provider-section" className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm sticky top-24">
                            <h3 className="text-lg font-bold text-gray-900 mb-6">Service Provider</h3>
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
                                    {service.provider?.name?.charAt(0) || 'P'}
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900">{service.provider?.name || 'Professional Provider'}</h4>
                                    <p className="text-sm text-gray-500">Member since 2023</p>
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <Phone className="h-4 w-4 text-blue-600" />
                                    <span>{service.provider?.phone || 'Hidden for security'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <Mail className="h-4 w-4 text-blue-600" />
                                    <span>{service.provider?.email || 'Hidden for security'}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <Shield className="h-4 w-4 text-blue-600" />
                                    <span>Verified Professional</span>
                                </div>
                            </div>

                            <Button variant="outline" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50">
                                Contact Provider
                            </Button>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-8">
                        {/* Features/Highlights */}
                        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                            <h3 className="text-xl font-bold text-gray-900 mb-6">Why Choose This Service?</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    'Professional and reliable execution',
                                    'Affordable student-friendly rates',
                                    'Flexible scheduling options',
                                    'High-quality results guaranteed',
                                    'Direct communication with provider',
                                    'Verified identity for safety'
                                ].map((feature, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                                        <span className="text-gray-700">{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Availability / Schedule */}
                        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-blue-600" /> Working Hours
                            </h3>
                            <div className="space-y-3">
                                {service.availabilityDays ? (
                                    service.availabilityDays.filter(d => d.available).map((d, i) => (
                                        <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                                            <span className="font-medium text-gray-700">{d.day}</span>
                                            <span className="text-gray-600">{d.from} - {d.to}</span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-600 italic">Availability details: {service.availability || 'Contact provider for details'}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
};

export default ServiceDetails;
