import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCloudUploadAlt, FaSpinner, FaCheckCircle, FaExclamationCircle, FaArrowLeft, FaFilePdf, FaTimes } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { compressImage } from '../utils/compression';
import Modal from '../components/ui/Modal';

const NationalIdUpload = () => {
    const navigate = useNavigate();
    const { user, updateUser } = useAuth();
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleFileChange = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length === 0) return;

        // Limit to 2 files (e.g. Front and Back)
        const totalFiles = [...files, ...selectedFiles].slice(0, 2);

        const processedFiles = [];

        setUploading(true);
        try {
            for (const file of selectedFiles) {
                if (files.length + processedFiles.length >= 2) break;

                // Compress if image, otherwise just check size for PDF
                if (file.type.startsWith('image/')) {
                    toast.info(`Compressing ${file.name}...`);
                    const compressed = await compressImage(file, { maxSizeMB: 4.5 }); // Use 4.5 to be safe
                    processedFiles.push({
                        file: compressed,
                        preview: URL.createObjectURL(compressed),
                        name: file.name,
                        type: file.type
                    });
                } else if (file.type === 'application/pdf') {
                    if (file.size > 5 * 1024 * 1024) {
                        toast.error(`${file.name} is too large (>5MB). Please optimize your PDF.`);
                        continue;
                    }
                    processedFiles.push({
                        file,
                        preview: null,
                        name: file.name,
                        type: file.type
                    });
                } else {
                    toast.warning(`${file.name} is not a supported format.`);
                }
            }

            setFiles(prev => [...prev, ...processedFiles].slice(0, 2));
        } catch (error) {
            console.error('Compression error:', error);
            toast.error('Error processing files');
        } finally {
            setUploading(false);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => {
            const newFiles = [...prev];
            if (newFiles[index].preview) {
                URL.revokeObjectURL(newFiles[index].preview);
            }
            newFiles.splice(index, 1);
            return newFiles;
        });
    };

    const handleUpload = async () => {
        if (files.length === 0) {
            toast.error('Please select at least one file to upload');
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            files.forEach(f => {
                formData.append('files', f.file);
            });

            // 1. Upload to multiple upload endpoint
            const uploadResponse = await api.post('/upload/multiple', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            const urls = uploadResponse.data.urls;
            // Store as JSON string
            const nationalIdUrl = JSON.stringify(urls);

            // 2. Update user profile with the URL JSON
            await api.patch('/users/me', {
                nationalIdUrl
            });

            // Update local user context
            if (user) {
                updateUser({
                    ...user,
                    nationalIdUrl,
                    nationalIdStatus: 'pending'
                });
            }

            setSuccess(true);
            toast.success('National ID documents uploaded successfully');

        } catch (error) {
            console.error('Error uploading IDs:', error);
            const data = error.response?.data
            let msg = data?.message || data?.error || 'Failed to upload National ID. Please try again.'
            
            if (data?.details?.fields) {
                msg = `Missing or invalid: ${data.details.fields.join(', ')}`
            }
            toast.error(msg);
        } finally {
            setUploading(false);
        }
    };

    const handleSuccessClose = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-gray-100 py-12 px-0 md:px-6 lg:px-8">
            <div className="max-w-md mx-auto bg-white md:rounded-xl shadow-md overflow-hidden md:max-w-2xl border-0 md:border border-gray-100">
                <div className="p-8">
                    <button
                        onClick={() => navigate('/customer/account-verification')}
                        className="flex items-center text-gray-600 hover:text-gray-900 mb-6 ml-0"
                    >
                        <FaArrowLeft className="mr-2" /> Back to Verification
                    </button>

                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload National ID</h1>
                    <p className="text-gray-600 mb-8">Please upload clear scanned copies or photos of your National ID card (Front and Back). Images will be automatically optimized.</p>

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {files.map((fileObj, index) => (
                                <div key={index} className="relative border rounded-lg p-2 bg-gray-50 group">
                                    {fileObj.type === 'application/pdf' ? (
                                        <div className="flex flex-col items-center justify-center h-48 bg-gray-100 rounded">
                                            <FaFilePdf className="text-5xl text-red-500 mb-2" />
                                            <span className="text-xs text-gray-700 font-medium truncate w-full text-center px-2">{fileObj.name}</span>
                                        </div>
                                    ) : (
                                        <img src={fileObj.preview} alt={`ID Preview ${index + 1}`} className="h-48 w-full object-cover rounded" />
                                    )}
                                    <button
                                        onClick={() => removeFile(index)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Remove file"
                                    >
                                        <FaTimes size={12} />
                                    </button>
                                </div>
                            ))}

                            {files.length < 2 && (
                                <div className="border-2 border-dashed border-gray-300 rounded-lg h-48 flex flex-col items-center justify-center hover:border-blue-500 transition-colors bg-gray-50 cursor-pointer relative">
                                    <FaCloudUploadAlt className="h-10 w-10 text-gray-400" />
                                    <span className="mt-2 text-sm text-blue-600 font-medium">Add {files.length === 0 ? 'Front Side' : 'Back Side'}</span>
                                    <input
                                        type="file"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        accept="image/*,.pdf"
                                        multiple
                                        onChange={handleFileChange}
                                        disabled={uploading}
                                    />
                                </div>
                            )}
                        </div>

                        {files.length > 0 && (
                            <p className="text-xs text-gray-500 text-center">
                                {files.length} of 2 files selected. Images are automatically compressed.
                            </p>
                        )}

                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <FaExclamationCircle className="h-5 w-5 text-yellow-400" aria-hidden="true" />
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm text-yellow-700">
                                        Ensure your name and ID number are clearly visible on both sides.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleUpload}
                            disabled={files.length === 0 || uploading}
                            className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${files.length === 0 || uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                        >
                            {uploading ? (
                                <>
                                    <FaSpinner className="animate-spin mr-2 h-5 w-5" />
                                    Processing...
                                </>
                            ) : (
                                `Submit ${files.length} Document(s)`
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Success Modal */}
            <Modal isOpen={success} onClose={handleSuccessClose} title="Upload Successful">
                <div className="text-center">
                    <FaCheckCircle className="text-6xl text-green-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Documents Submitted</h2>
                    <p className="text-gray-600 mb-6">
                        Your National ID documents have been successfully uploaded and are pending verification.
                    </p>
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={handleSuccessClose}
                            className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 transition"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => navigate('/')}
                            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
                        >
                            Go to Home
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default NationalIdUpload;
