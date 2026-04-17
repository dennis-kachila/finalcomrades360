import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useToast } from '../../components/ui/use-toast';
import { ArrowLeft, Plus, Upload, X, Utensils, Clock } from 'lucide-react';
import serviceApi from '../../services/serviceApi';
import { useCategories } from '../../contexts/CategoriesContext';

const serviceSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  category: z.string().min(1, 'Please select a category'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.string().min(1, 'Price is required'),
  discountPercentage: z.string().optional(),
  discountPrice: z.string().optional(),
  duration: z.string().min(1, 'Duration is required'),
  location: z.string().min(1, 'General location is required'),
  vendorLocation: z.string().optional(),
  vendorLat: z.any().optional(),
  vendorLng: z.any().optional(),
  tags: z.string().optional(),
  terms: z.boolean().refine(val => val === true, 'You must accept the terms')
});

const CreateService = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { categories: allCategories } = useCategories();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);

  // Filter for categories explicitly tagged as 'service'
  const serviceCategories = React.useMemo(() => {
    if (!allCategories) return [];
    return allCategories.filter(cat => String(cat.taxonomyType) === 'service');
  }, [allCategories]);

  const form = useForm({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      category: '',
      description: '',
      price: '',
      discountPercentage: '0',
      discountPrice: '',
      duration: '',
      location: '',
      vendorLocation: '',
      vendorLat: '',
      vendorLng: '',
      tags: '',
      terms: false,
      isAvailable: true,
      availabilityMode: 'AUTO',
      availabilityDays: [
        { day: 'Monday', available: true, from: '08:00', to: '18:00' },
        { day: 'Tuesday', available: true, from: '08:00', to: '18:00' },
        { day: 'Wednesday', available: true, from: '08:00', to: '18:00' },
        { day: 'Thursday', available: true, from: '08:00', to: '18:00' },
        { day: 'Friday', available: true, from: '08:00', to: '18:00' },
        { day: 'Saturday', available: false, from: '10:00', to: '16:00' },
        { day: 'Sunday', available: false, from: '10:00', to: '16:00' },
        { day: 'All Days', available: false, from: '08:00', to: '18:00' }
      ]
    }
  });

  const { watch, setValue } = form;
  const price = watch('price');
  const discountPercentage = watch('discountPercentage');

  // Auto-calculate discountPrice
  React.useEffect(() => {
    const p = parseFloat(price || 0);
    const d = parseFloat(discountPercentage || 0);
    if (d > 0) {
      const dp = p * (1 - d / 100);
      setValue('discountPrice', dp.toFixed(2));
    } else {
      setValue('discountPrice', p.toFixed(2));
    }
  }, [price, discountPercentage, setValue]);

  const { isAvailable, availabilityMode, availabilityDays } = form.watch();

  const updateAvailabilityDay = (day, updates) => {
    const currentDays = [...(form.getValues('availabilityDays') || [])];
    const index = currentDays.findIndex(d => d.day === day);
    if (index >= 0) {
      currentDays[index] = { ...currentDays[index], ...updates };
      form.setValue('availabilityDays', currentDays);
    }
  };

  const copyToAll = (dayData) => {
    const newDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => ({
      day: d,
      available: dayData.available,
      from: dayData.from,
      to: dayData.to
    }));
    form.setValue('availabilityDays', [...newDays, { ...dayData, day: 'All Days' }]);
    toast({ title: 'Schedule Copied', description: `Synced all days to ${dayData.from} - ${dayData.to}` });
  };



  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setUploadedImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (index) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data) => {
    try {
      setIsSubmitting(true);

      // Strict Validation for Images
      if (uploadedImages.length === 0) {
        toast({
          title: 'Validation Error',
          description: 'At least one service image is required.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      const formData = new FormData();

      // Append basic fields
      formData.append('title', data.name);
      formData.append('description', data.description);
      formData.append('price', data.price);
      formData.append('basePrice', data.price);
      formData.append('displayPrice', `KES ${data.price}`); // For legacy string display
      formData.append('discountPercentage', data.discountPercentage || '0');
      formData.append('discountPrice', data.discountPrice);
      formData.append('categoryId', data.category); // Assuming backend expects ID
      formData.append('duration', data.duration);
      formData.append('location', data.location);
      formData.append('isAvailable', data.isAvailable);
      formData.append('availabilityMode', data.availabilityMode || 'AUTO');
      formData.append('availabilityDays', JSON.stringify(data.availabilityDays));

      // Append images
      uploadedImages.forEach((img, index) => {
        formData.append('images', img.file);
      });

      await serviceApi.createService(formData);

      toast({
        title: 'Service submitted for review',
        description: 'Your service will be available after approval',
      });

      navigate('/dashboard/services');
    } catch (error) {
      console.error('Error creating service:', error);
      toast({
        title: 'Error',
        description: 'Failed to create service. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Services
      </Button>

      <h1 className="text-2xl font-bold mb-6">Create New Service</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Service Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Professional Home Cleaning" maxLength={20} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {serviceCategories.length === 0 ? (
                            <SelectItem value="none" disabled>No service categories available</SelectItem>
                          ) : (
                            serviceCategories.map(cat => (
                              <SelectItem key={cat.id || cat._id} value={String(cat.id || cat._id)}>
                                {cat.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your service in detail..."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Price (KES) *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-gray-500">KES</span>
                            <Input
                              type="number"
                              className="pl-12"
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="discountPercentage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount %</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            min="0"
                            max="100"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="discountPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Final Price (KES)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-gray-500">KES</span>
                            <Input
                              readOnly
                              disabled
                              className="pl-12 bg-gray-50 font-bold"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="60">1 hour</SelectItem>
                            <SelectItem value="90">1.5 hours</SelectItem>
                            <SelectItem value="120">2 hours</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Smart Location Section */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="text-lg">📍</span> Location Details
                  </h3>

                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="mb-4">
                        <FormLabel>General Area (City/Region) *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., New York, NY" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vendorLocation"
                    render={({ field }) => (
                      <FormItem className="mb-2">
                        <FormLabel>Precise Address (for map & distance)</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="e.g., 123 Main St, Suite 4B" {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Use Current Location"
                            onClick={() => {
                              if ("geolocation" in navigator) {
                                navigator.geolocation.getCurrentPosition(
                                  (position) => {
                                    form.setValue('vendorLat', position.coords.latitude);
                                    form.setValue('vendorLng', position.coords.longitude);
                                    toast({ title: "Location Found", description: "Coordinates updated." });
                                  },
                                  (error) => toast({ variant: "destructive", title: "Location Error", description: error.message })
                                );
                              }
                            }}
                          >
                            <span className="text-lg">🎯</span>
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Hidden Coords */}
                  <FormField name="vendorLat" control={form.control} render={({ field }) => <input type="hidden" {...field} />} />
                  <FormField name="vendorLng" control={form.control} render={({ field }) => <input type="hidden" {...field} />} />

                  {(form.watch('vendorLat') || form.watch('vendorLng')) && (
                    <p className="text-xs text-green-600 mt-1 flex items-center">
                      ✓ Coordinates captured: {Number(form.watch('vendorLat')).toFixed(4)}, {Number(form.watch('vendorLng')).toFixed(4)}
                    </p>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., cleaning, home, deep clean"
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-gray-500 mt-1">Separate tags with commas</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Service Images *</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {uploadedImages.map((img, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={img.preview}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-32 object-cover rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}

                    {uploadedImages.length < 6 && (
                      <label
                        className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-md cursor-pointer hover:border-blue-500 transition-colors"
                        htmlFor="image-upload"
                      >
                        <Upload className="h-6 w-6 text-gray-400 mb-2" />
                        <span className="text-sm text-gray-500">Add Image</span>
                        <input
                          id="image-upload"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Upload up to 6 images. First image will be used as the main image.</p>
                </CardContent>
              </Card>

              <Card className="border-orange-100 shadow-sm">
                <CardHeader className="bg-orange-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-orange-900 flex items-center gap-2">
                        <Utensils size={18} />
                        Service Availability
                      </CardTitle>
                      <p className="text-xs text-orange-700 mt-1">Set your weekly operating hours</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 bg-white p-2 rounded-xl border border-orange-100">
                      {[
                        { value: 'AUTO', label: 'Follow Schedule', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                        { value: 'OPEN', label: 'Force Open Now', color: 'bg-green-50 text-green-700 border-green-200' },
                        { value: 'CLOSED', label: 'Force Closed Now', color: 'bg-red-50 text-red-700 border-red-200' }
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => form.setValue('availabilityMode', opt.value)}
                          className={`flex-1 px-3 py-2 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${availabilityMode === opt.value ? `${opt.color} ring-2 ring-offset-1` : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'All Days'].map((day) => {
                      const dayData = (availabilityDays || []).find(d => d.day === day) || { day, available: false, from: '08:00', to: '18:00' };

                      return (
                        <div key={day} className={`flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg border transition-all ${dayData.available ? 'bg-white border-orange-200 shadow-sm' : 'bg-gray-50/50 border-gray-100 opacity-60'}`}>
                          <div className="flex items-center gap-3 min-w-[140px]">
                            <button
                              type="button"
                              onClick={() => updateAvailabilityDay(day, { available: !dayData.available })}
                              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${dayData.available ? 'bg-green-500' : 'bg-gray-300'}`}
                            >
                              <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${dayData.available ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                            <span className={`font-bold text-xs ${dayData.available ? 'text-gray-900' : 'text-gray-400'}`}>{day}</span>
                          </div>

                          {dayData.available && (
                            <div className="flex items-center gap-2 mt-2 sm:mt-0">
                              <div className="flex items-center gap-1.5 bg-orange-50 px-2 py-1 rounded-md border border-orange-100">
                                <Clock size={12} className="text-orange-400" />
                                <input
                                  type="time"
                                  value={dayData.from}
                                  onChange={(e) => updateAvailabilityDay(day, { from: e.target.value })}
                                  className="text-[10px] font-bold border-none bg-transparent p-0 focus:ring-0 w-[55px]"
                                />
                                <span className="text-[10px] text-orange-300 font-bold">to</span>
                                <input
                                  type="time"
                                  value={dayData.to}
                                  onChange={(e) => updateAvailabilityDay(day, { to: e.target.value })}
                                  className="text-[10px] font-bold border-none bg-transparent p-0 focus:ring-0 w-[55px]"
                                />
                              </div>
                              {day === 'All Days' && (
                                <button
                                  type="button"
                                  onClick={() => copyToAll(dayData)}
                                  className="text-[9px] font-black uppercase text-orange-600 bg-orange-50 px-2 py-1.5 rounded hover:bg-orange-100 transition-colors border border-orange-200"
                                >
                                  Sync All
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Terms & Conditions</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="terms"
                    render={({ field }) => (
                      <FormItem className="flex items-start space-x-3 space-y-0">
                        <FormControl>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1"
                            checked={field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium">
                            I agree to the terms and conditions
                          </FormLabel>
                          <p className="text-xs text-gray-500">
                            By checking this box, you confirm that all information provided is accurate and you agree to our terms of service.
                          </p>
                        </div>
                        <FormMessage className="col-span-full" />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/dashboard/services')}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit for Review'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default CreateService;
