'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

type OutputFormat = 'jpeg' | 'jpg' | 'png' | 'webp' | 'avif';
type ResizeFit = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
type WatermarkPosition =
  | 'northwest'
  | 'north'
  | 'northeast'
  | 'west'
  | 'center'
  | 'east'
  | 'southwest'
  | 'south'
  | 'southeast';

interface ImageVariant {
  hash: string;
  url?: string;
  format: string;
  contentType?: string;
  size: number;
  width?: number;
  height?: number;
}

interface ImageItem {
  id: string;
  original: {
    originalName: string;
    format: string;
    size: number;
    width?: number;
    height?: number;
  };
  variants: ImageVariant[];
}

interface ListResult {
  items: ImageItem[];
  pagination?: {
    page?: number;
    totalPages?: number;
    total?: number;
  };
}

interface TransformApiVariant {
  hash: string;
  url?: string;
  format?: string;
  contentType?: string;
  size?: number;
  width?: number;
  height?: number;
}

interface TransformApiResult {
  imageId: string;
  cached: boolean;
  variant: TransformApiVariant;
}

interface TransformState {
  resizeWidth: string;
  resizeHeight: string;
  resizeFit: ResizeFit;
  rotate: string;
  compressQuality: string;
  format: OutputFormat | '';
  flip: boolean;
  mirror: boolean;
  grayscale: boolean;
  sepia: boolean;
  cropWidth: string;
  cropHeight: string;
  cropX: string;
  cropY: string;
  watermarkText: string;
  watermarkPosition: WatermarkPosition;
  watermarkFontSize: string;
  watermarkOpacity: string;
}

interface TransformBuildResult {
  transformations: Record<string, unknown>;
  helperMessage?: string;
}

const TOKEN_KEY = 'accessToken';
const PAGE_LIMIT = 20;

const IMAGE_FORMATS: OutputFormat[] = ['jpeg', 'jpg', 'png', 'webp', 'avif'];
const RESIZE_FITS: ResizeFit[] = ['cover', 'contain', 'fill', 'inside', 'outside'];
const WATERMARK_POSITIONS: WatermarkPosition[] = [
  'northwest',
  'north',
  'northeast',
  'west',
  'center',
  'east',
  'southwest',
  'south',
  'southeast',
];

const inputClass =
  'w-full rounded-xl border border-sky-200 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200/70 disabled:bg-slate-100/70';
const panelClass =
  'rounded-2xl border border-sky-100 bg-white/85 p-4 shadow-[0_20px_45px_-30px_rgba(14,73,169,0.45)] backdrop-blur';

const INITIAL_TRANSFORM_STATE: TransformState = {
  resizeWidth: '',
  resizeHeight: '',
  resizeFit: 'cover',
  rotate: '',
  compressQuality: '',
  format: '',
  flip: false,
  mirror: false,
  grayscale: false,
  sepia: false,
  cropWidth: '',
  cropHeight: '',
  cropX: '',
  cropY: '',
  watermarkText: '',
  watermarkPosition: 'southeast',
  watermarkFontSize: '',
  watermarkOpacity: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function parseJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.length > 0) {
    return payload;
  }

  if (isRecord(payload)) {
    const message = payload.message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join(', ');
    }
  }

  return fallback;
}

function toIntOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function fileSize(bytes?: number) {
  if (!bytes) {
    return '-';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildTransformations(state: TransformState): TransformBuildResult {
  const transformations: Record<string, unknown> = {};

  const width = toIntOrNull(state.resizeWidth);
  const height = toIntOrNull(state.resizeHeight);
  if (width !== undefined || height !== undefined) {
    if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
      transformations.resize = {
        width,
        height,
        fit: state.resizeFit,
      };
    }
  }

  const rotate = toIntOrNull(state.rotate);
  if (typeof rotate === 'number') {
    transformations.rotate = rotate;
  }

  const quality = toIntOrNull(state.compressQuality);
  if (typeof quality === 'number' && quality >= 1 && quality <= 100) {
    transformations.compress = { quality };
  }

  if (state.format) {
    transformations.format = state.format;
  }

  if (state.flip) {
    transformations.flip = true;
  }
  if (state.mirror) {
    transformations.mirror = true;
  }

  if (state.grayscale || state.sepia) {
    transformations.filters = {
      grayscale: state.grayscale,
      sepia: state.sepia,
    };
  }

  const cropWidth = toIntOrNull(state.cropWidth);
  const cropHeight = toIntOrNull(state.cropHeight);
  const cropX = toIntOrNull(state.cropX);
  const cropY = toIntOrNull(state.cropY);

  if (
    typeof cropWidth === 'number' &&
    cropWidth > 0 &&
    typeof cropHeight === 'number' &&
    cropHeight > 0 &&
    typeof cropX === 'number' &&
    cropX >= 0 &&
    typeof cropY === 'number' &&
    cropY >= 0
  ) {
    transformations.crop = {
      width: cropWidth,
      height: cropHeight,
      x: cropX,
      y: cropY,
    };
  }

  if (state.watermarkText.trim()) {
    const watermark: Record<string, unknown> = {
      text: state.watermarkText.trim(),
      position: state.watermarkPosition,
    };

    const fontSize = toIntOrNull(state.watermarkFontSize);
    if (typeof fontSize === 'number' && fontSize >= 12 && fontSize <= 96) {
      watermark.fontSize = fontSize;
    }

    const opacity = toIntOrNull(state.watermarkOpacity);
    if (typeof opacity === 'number' && opacity >= 10 && opacity <= 100) {
      watermark.opacity = opacity;
    }

    transformations.watermark = watermark;
  }

  let helperMessage: string | undefined;
  if (width !== undefined || height !== undefined) {
    if (!(typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0)) {
      helperMessage = 'Resize applies when both width and height are set.';
    }
  }

  if (
    cropWidth !== undefined ||
    cropHeight !== undefined ||
    cropX !== undefined ||
    cropY !== undefined
  ) {
    if (!transformations.crop) {
      helperMessage = 'Crop applies when width, height, x, and y are all set.';
    }
  }

  return { transformations, helperMessage };
}

export default function Home() {
  const router = useRouter();
  const { authFetch, logout } = useAuth();

  const applySequence = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [selectedImageId, setSelectedImageId] = useState('');
  const [transformState, setTransformState] = useState<TransformState>(INITIAL_TRANSFORM_STATE);
  const [transformError, setTransformError] = useState('');
  const [transformHelper, setTransformHelper] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [appliedVariantHash, setAppliedVariantHash] = useState('');
  const [appliedFromCache, setAppliedFromCache] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? null,
    [images, selectedImageId],
  );

  const forceLogout = useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout, router]);

  const loadImages = useCallback(
    async (targetPage: number) => {
      setIsLoadingImages(true);
      setImagesError(null);

      try {
        const response = await authFetch(`/images?page=${targetPage}&limit=${PAGE_LIMIT}`);

        if (response.status === 401) {
          forceLogout();
          return;
        }

        const payload = await parseJsonOrText(response);
        if (!response.ok) {
          setImagesError(getErrorMessage(payload, 'Failed to load images.'));
          return;
        }

        const result = payload as ListResult;
        const loadedImages = Array.isArray(result.items) ? result.items : [];
        setImages(loadedImages);
        setPage(result.pagination?.page ?? targetPage);
        setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
        setTotalItems(result.pagination?.total ?? 0);
      } catch (error) {
        setImagesError(error instanceof Error ? error.message : 'Failed to load images.');
      } finally {
        setIsLoadingImages(false);
      }
    },
    [authFetch, forceLogout],
  );

  const replacePreview = useCallback((nextUrl: string | null) => {
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return nextUrl;
    });
  }, []);

  const fetchPreview = useCallback(
    async (imageId: string, variant?: string, sequence?: number) => {
      const query = new URLSearchParams();
      if (variant) {
        query.set('variant', variant);
      }

      const path = `/images/${imageId}${query.size ? `?${query.toString()}` : ''}`;
      const response = await authFetch(path);

      if (response.status === 401) {
        forceLogout();
        return false;
      }

      if (!response.ok) {
        const payload = await parseJsonOrText(response);
        setTransformError(getErrorMessage(payload, 'Failed to retrieve image preview.'));
        return false;
      }

      const blob = await response.blob();
      if (typeof sequence === 'number' && sequence !== applySequence.current) {
        return false;
      }

      const nextUrl = URL.createObjectURL(blob);
      replacePreview(nextUrl);

      const contentDisposition = response.headers.get('Content-Disposition') ?? '';
      const match = contentDisposition.match(/filename="([^"]+)"/i);
      setPreviewName(match?.[1] ?? `image-${imageId}.jpeg`);

      return true;
    },
    [authFetch, forceLogout, replacePreview],
  );

  const applyTransformPreview = useCallback(async () => {
    if (!selectedImageId) {
      return;
    }

    const sequence = ++applySequence.current;
    const { transformations, helperMessage } = buildTransformations(transformState);

    setTransformHelper(helperMessage ?? '');
    setTransformError('');
    setIsApplying(true);

    try {
      if (Object.keys(transformations).length === 0) {
        setAppliedVariantHash('');
        setAppliedFromCache(false);
        await fetchPreview(selectedImageId, undefined, sequence);
        return;
      }

      const transformResponse = await authFetch(`/images/${selectedImageId}/transform`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transformations }),
      });

      if (transformResponse.status === 401) {
        forceLogout();
        return;
      }

      if (!transformResponse.ok) {
        const payload = await parseJsonOrText(transformResponse);
        if (sequence === applySequence.current) {
          setTransformError(getErrorMessage(payload, 'Failed to apply transformation.'));
        }
        return;
      }

      const blob = await transformResponse.blob();
      if (sequence !== applySequence.current) {
        return;
      }

      const nextUrl = URL.createObjectURL(blob);
      replacePreview(nextUrl);

      const contentDisposition = transformResponse.headers.get('Content-Disposition') ?? '';
      const match = contentDisposition.match(/filename="([^"]+)"/i);
      setPreviewName(match?.[1] ?? `image-${selectedImageId}-preview`);
      setAppliedVariantHash('');
      setAppliedFromCache(false);
    } catch (error) {
      if (sequence === applySequence.current) {
        setTransformError(error instanceof Error ? error.message : 'Failed to apply transformation.');
      }
    } finally {
      if (sequence === applySequence.current) {
        setIsApplying(false);
      }
    }
  }, [authFetch, fetchPreview, forceLogout, replacePreview, selectedImageId, transformState]);

  const saveTransformVariant = useCallback(async () => {
    if (!selectedImageId) {
      return;
    }

    const sequence = ++applySequence.current;
    const { transformations, helperMessage } = buildTransformations(transformState);

    setTransformHelper(helperMessage ?? '');
    setTransformError('');
    setIsSaving(true);

    try {
      if (Object.keys(transformations).length === 0) {
        setTransformError('Add at least one transformation before saving.');
        return;
      }

      const saveResponse = await authFetch(`/images/${selectedImageId}/transform/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transformations }),
      });

      if (saveResponse.status === 401) {
        forceLogout();
        return;
      }

      const payload = (await parseJsonOrText(saveResponse)) as TransformApiResult;

      if (!saveResponse.ok) {
        if (sequence === applySequence.current) {
          setTransformError(getErrorMessage(payload, 'Failed to save transformation.'));
        }
        return;
      }

      if (sequence !== applySequence.current) {
        return;
      }

      const variantHash =
        payload &&
        isRecord(payload) &&
        isRecord(payload.variant) &&
        typeof payload.variant.hash === 'string'
          ? payload.variant.hash
          : '';

      if (!variantHash) {
        setTransformError('Invalid save response from server.');
        return;
      }

      setAppliedVariantHash(variantHash);
      setAppliedFromCache(Boolean(payload.cached));
      await fetchPreview(selectedImageId, variantHash, sequence);
      await loadImages(page);
    } catch (error) {
      if (sequence === applySequence.current) {
        setTransformError(error instanceof Error ? error.message : 'Failed to save transformation.');
      }
    } finally {
      if (sequence === applySequence.current) {
        setIsSaving(false);
      }
    }
  }, [
    authFetch,
    fetchPreview,
    forceLogout,
    loadImages,
    page,
    selectedImageId,
    transformState,
  ]);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      router.replace('/login');
      return;
    }

    setAuthReady(true);
  }, [router]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    void loadImages(page);
  }, [authReady, loadImages, page]);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (images.length === 0) {
      setSelectedImageId('');
      setAppliedVariantHash('');
      setAppliedFromCache(false);
      replacePreview(null);
      setPreviewName('');
      return;
    }

    const selectedStillExists = images.some((image) => image.id === selectedImageId);
    if (!selectedImageId || !selectedStillExists) {
      setSelectedImageId(images[0].id);
    }
  }, [authReady, images, replacePreview, selectedImageId]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!authReady || !selectedImageId) {
      return;
    }

    const sequence = ++applySequence.current;
    void fetchPreview(selectedImageId, undefined, sequence);
  }, [authReady, fetchPreview, selectedImageId]);

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadError('');
    setUploadMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await authFetch('/images', {
        method: 'POST',
        body: formData,
      });

      if (response.status === 401) {
        forceLogout();
        return;
      }

      const payload = await parseJsonOrText(response);
      if (!response.ok) {
        setUploadError(getErrorMessage(payload, 'Upload failed.'));
        return;
      }

      const uploaded = payload as Partial<ImageItem>;
      if (uploaded.id) {
        setSelectedImageId(uploaded.id);
      }

      setUploadMessage('Image uploaded successfully.');
      setTransformState(INITIAL_TRANSFORM_STATE);
      setAppliedVariantHash('');
      setPage(1);
      await loadImages(1);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  }, [authFetch, forceLogout, loadImages]);

  const openUploadPicker = useCallback(() => {
    if (isUploading) {
      return;
    }
    uploadInputRef.current?.click();
  }, [isUploading]);

  const handleUploadFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;
      event.currentTarget.value = '';

      if (!file) {
        return;
      }

      void handleUpload(file);
    },
    [handleUpload],
  );

  const handleSelectImage = useCallback((imageId: string) => {
    setSelectedImageId(imageId);
    setTransformState(INITIAL_TRANSFORM_STATE);
    setTransformError('');
    setTransformHelper('');
    setAppliedVariantHash('');
    setAppliedFromCache(false);
    setDeleteError('');
  }, []);

  const handleDeleteImage = useCallback(
    async (imageId: string) => {
      const image = images.find((item) => item.id === imageId);
      const fileName = image?.original.originalName ?? 'this image';
      const confirmed = window.confirm(
        `Delete ${fileName}? This will also delete all transformed variants.`,
      );

      if (!confirmed) {
        return;
      }

      setDeleteError('');
      setDeletingImageId(imageId);

      try {
        const response = await authFetch(`/images/${imageId}`, {
          method: 'DELETE',
        });

        if (response.status === 401) {
          forceLogout();
          return;
        }

        const payload = await parseJsonOrText(response);
        if (!response.ok) {
          setDeleteError(getErrorMessage(payload, 'Failed to delete image.'));
          return;
        }

        if (selectedImageId === imageId) {
          setSelectedImageId('');
          setTransformState(INITIAL_TRANSFORM_STATE);
          setTransformError('');
          setTransformHelper('');
          setAppliedVariantHash('');
          setAppliedFromCache(false);
          replacePreview(null);
          setPreviewName('');
        }

        const nextPage = images.length === 1 && page > 1 ? page - 1 : page;
        if (nextPage !== page) {
          setPage(nextPage);
        }

        await loadImages(nextPage);
      } catch (error) {
        setDeleteError(
          error instanceof Error ? error.message : 'Failed to delete image.',
        );
      } finally {
        setDeletingImageId(null);
      }
    },
    [
      authFetch,
      forceLogout,
      images,
      loadImages,
      page,
      replacePreview,
      selectedImageId,
    ],
  );

  const handleReset = useCallback(() => {
    if (!selectedImageId) {
      return;
    }

    setTransformState(INITIAL_TRANSFORM_STATE);
    setTransformError('');
    setTransformHelper('');
    setAppliedVariantHash('');
    setAppliedFromCache(false);
    applySequence.current += 1;
    void fetchPreview(selectedImageId);
  }, [fetchPreview, selectedImageId]);

  if (!authReady) {
    return null;
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-3 py-4 sm:px-4 sm:py-6">
      <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-16 h-80 w-80 rounded-full bg-indigo-300/35 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl" />

      <div className="mx-auto max-w-[1700px] space-y-4">
        <header className="relative overflow-hidden rounded-3xl border border-sky-400/40 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 p-4 text-white shadow-[0_24px_60px_-30px_rgba(30,64,175,0.65)] sm:p-5">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_right,rgba(255,255,255,0.26),transparent_62%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-sky-100">Media Console</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Cloud Studio</h1>
              <p className="mt-1 text-sm text-sky-100">
                Live preview powered by cached image variants.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <span className="rounded-full border border-white/40 bg-white/15 px-3 py-1 text-xs font-medium text-white">
                {totalItems} assets
              </span>
              <button
                type="button"
                onClick={() => void loadImages(page)}
                className="rounded-xl border border-white/45 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  router.replace('/login');
                }}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-sky-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_380px]">
          <aside className="space-y-4">
            <div className={panelClass}>
              <h2 className="text-base font-semibold text-slate-900">Upload Asset</h2>
              <p className="mt-1 text-xs text-slate-500">
                Click the button, pick a file, it uploads immediately.
              </p>
              <div className="mt-3 space-y-3">
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadFileChange}
                />
                <button
                  type="button"
                  onClick={openUploadPicker}
                  disabled={isUploading}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-sky-700 hover:to-blue-800 disabled:opacity-70"
                >
                  {isUploading ? 'Uploading...' : 'Upload image'}
                </button>
                {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}
                {uploadMessage ? <p className="text-sm text-green-700">{uploadMessage}</p> : null}
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Library</h2>
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs text-sky-700">
                  Page {page}/{totalPages}
                </span>
              </div>
              {imagesError ? <p className="mb-2 text-sm text-red-600">{imagesError}</p> : null}
              {deleteError ? <p className="mb-2 text-sm text-red-600">{deleteError}</p> : null}
              <div className="max-h-[22rem] space-y-2 overflow-auto pr-1 sm:max-h-[30rem]">
                {images.length === 0 && !isLoadingImages ? (
                  <p className="rounded-xl border border-dashed border-sky-200 bg-sky-50/70 p-3 text-sm text-slate-600">
                    No uploaded images.
                  </p>
                ) : null}

                {images.map((image) => (
                  <div
                    key={image.id}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedImageId === image.id
                        ? 'border-sky-400 bg-gradient-to-r from-sky-50 to-blue-50'
                        : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectImage(image.id)}
                      className="w-full text-left"
                    >
                      <p className="truncate text-sm font-semibold text-slate-900">{image.original.originalName}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {image.original.width ?? '-'} x {image.original.height ?? '-'} | {image.original.format}
                      </p>
                      <p className="text-xs text-slate-500">{fileSize(image.original.size)}</p>
                      <p className="mt-1 text-xs font-medium text-sky-700">
                        Variants: {image.variants.length}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteImage(image.id)}
                      disabled={deletingImageId === image.id}
                      className="mt-2 w-full rounded-lg border border-rose-300 bg-white px-2 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      {deletingImageId === image.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1 || isLoadingImages}
                  className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page >= totalPages || isLoadingImages}
                  className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </aside>

          <section className={panelClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Preview Canvas</h2>
                <p className="text-xs text-slate-600">
                  {selectedImage ? selectedImage.original.originalName : 'Select an image from the library'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                disabled={!selectedImageId}
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-sky-50 disabled:opacity-50 sm:w-auto"
              >
                Reset
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isApplying || isSaving ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              <span>
                {isApplying
                  ? 'Applying preview...'
                  : isSaving
                    ? 'Saving variant...'
                    : 'Ready'}
              </span>
              {appliedVariantHash ? (
                <span
                  className={`rounded-full px-2.5 py-1 font-medium ${
                    appliedFromCache
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  {appliedFromCache ? 'Cached' : 'New'} variant {appliedVariantHash.slice(0, 8)}
                </span>
              ) : null}
            </div>

            <div className="flex min-h-[17rem] items-center justify-center rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50/80 to-white p-3 sm:min-h-[26rem] lg:min-h-[38rem]">
              {previewUrl ? (
                <div className="w-full space-y-3">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-[14rem] w-full rounded-xl bg-white object-contain shadow-sm sm:max-h-[22rem] lg:max-h-[32rem]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-600">{previewName}</span>
                    <a
                      href={previewUrl}
                      download={previewName || 'image'}
                      className="rounded-lg border border-sky-200 bg-white px-3 py-1 text-xs text-sky-700 transition hover:bg-sky-50"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Preview will appear here.</p>
              )}
            </div>
          </section>

          <aside className={`${panelClass} lg:col-span-2 xl:col-span-1`}>
            <h2 className="text-base font-semibold text-slate-900">Transform Studio</h2>
            <p className="mt-1 text-xs text-slate-600">
              Apply for preview only. Save to store variant in S3 and database.
            </p>

            <div className="mt-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
                <input
                  type="number"
                  min={1}
                  placeholder="Width"
                  className={inputClass}
                  disabled={!selectedImageId}
                  value={transformState.resizeWidth}
                  onChange={(event) =>
                    setTransformState((prev) => ({ ...prev, resizeWidth: event.target.value }))
                  }
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Height"
                  className={inputClass}
                  disabled={!selectedImageId}
                  value={transformState.resizeHeight}
                  onChange={(event) =>
                    setTransformState((prev) => ({ ...prev, resizeHeight: event.target.value }))
                  }
                />
                <select
                  className={inputClass}
                  disabled={!selectedImageId}
                  value={transformState.resizeFit}
                  onChange={(event) =>
                    setTransformState((prev) => ({ ...prev, resizeFit: event.target.value as ResizeFit }))
                  }
                >
                  {RESIZE_FITS.map((fit) => (
                    <option key={fit} value={fit}>
                      Fit: {fit}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Rotate"
                  className={inputClass}
                  disabled={!selectedImageId}
                  value={transformState.rotate}
                  onChange={(event) =>
                    setTransformState((prev) => ({ ...prev, rotate: event.target.value }))
                  }
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="Quality 1-100"
                  className={inputClass}
                  disabled={!selectedImageId}
                  value={transformState.compressQuality}
                  onChange={(event) =>
                    setTransformState((prev) => ({ ...prev, compressQuality: event.target.value }))
                  }
                />
                <select
                  className={inputClass}
                  disabled={!selectedImageId}
                  value={transformState.format}
                  onChange={(event) =>
                    setTransformState((prev) => ({ ...prev, format: event.target.value as OutputFormat | '' }))
                  }
                >
                  <option value="">Keep format</option>
                  {IMAGE_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
                <label className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/50 px-2 py-1.5">
                  <input
                    type="checkbox"
                    disabled={!selectedImageId}
                    checked={transformState.flip}
                    onChange={(event) =>
                      setTransformState((prev) => ({ ...prev, flip: event.target.checked }))
                    }
                  />
                  Flip
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/50 px-2 py-1.5">
                  <input
                    type="checkbox"
                    disabled={!selectedImageId}
                    checked={transformState.mirror}
                    onChange={(event) =>
                      setTransformState((prev) => ({ ...prev, mirror: event.target.checked }))
                    }
                  />
                  Mirror
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/50 px-2 py-1.5">
                  <input
                    type="checkbox"
                    disabled={!selectedImageId}
                    checked={transformState.grayscale}
                    onChange={(event) =>
                      setTransformState((prev) => ({ ...prev, grayscale: event.target.checked }))
                    }
                  />
                  Grayscale
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50/50 px-2 py-1.5">
                  <input
                    type="checkbox"
                    disabled={!selectedImageId}
                    checked={transformState.sepia}
                    onChange={(event) =>
                      setTransformState((prev) => ({ ...prev, sepia: event.target.checked }))
                    }
                  />
                  Sepia
                </label>
              </div>

              <details className="rounded-xl border border-sky-100 bg-sky-50/50 p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Crop and Watermark</summary>
                <div className="mt-3 grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="Crop width"
                      className={inputClass}
                      disabled={!selectedImageId}
                      value={transformState.cropWidth}
                      onChange={(event) =>
                        setTransformState((prev) => ({ ...prev, cropWidth: event.target.value }))
                      }
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Crop height"
                      className={inputClass}
                      disabled={!selectedImageId}
                      value={transformState.cropHeight}
                      onChange={(event) =>
                        setTransformState((prev) => ({ ...prev, cropHeight: event.target.value }))
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Crop X"
                      className={inputClass}
                      disabled={!selectedImageId}
                      value={transformState.cropX}
                      onChange={(event) =>
                        setTransformState((prev) => ({ ...prev, cropX: event.target.value }))
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Crop Y"
                      className={inputClass}
                      disabled={!selectedImageId}
                      value={transformState.cropY}
                      onChange={(event) =>
                        setTransformState((prev) => ({ ...prev, cropY: event.target.value }))
                      }
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Watermark text"
                    className={inputClass}
                    disabled={!selectedImageId}
                    value={transformState.watermarkText}
                    onChange={(event) =>
                      setTransformState((prev) => ({ ...prev, watermarkText: event.target.value }))
                    }
                  />
                  <select
                    className={inputClass}
                    disabled={!selectedImageId}
                    value={transformState.watermarkPosition}
                    onChange={(event) =>
                      setTransformState((prev) => ({
                        ...prev,
                        watermarkPosition: event.target.value as WatermarkPosition,
                      }))
                    }
                  >
                    {WATERMARK_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={12}
                      max={96}
                      placeholder="Font size"
                      className={inputClass}
                      disabled={!selectedImageId}
                      value={transformState.watermarkFontSize}
                      onChange={(event) =>
                        setTransformState((prev) => ({ ...prev, watermarkFontSize: event.target.value }))
                      }
                    />
                    <input
                      type="number"
                      min={10}
                      max={100}
                      placeholder="Opacity"
                      className={inputClass}
                      disabled={!selectedImageId}
                      value={transformState.watermarkOpacity}
                      onChange={(event) =>
                        setTransformState((prev) => ({ ...prev, watermarkOpacity: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </details>

              {transformHelper ? <p className="text-xs text-amber-700">{transformHelper}</p> : null}
              {transformError ? <p className="text-sm text-red-600">{transformError}</p> : null}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => void applyTransformPreview()}
                  disabled={!selectedImageId || isApplying || isSaving}
                  className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-50"
                >
                  {isApplying ? 'Applying...' : 'Apply'}
                </button>
                <button
                  type="button"
                  onClick={() => void saveTransformVariant()}
                  disabled={!selectedImageId || isApplying || isSaving}
                  className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:from-sky-700 hover:to-blue-800 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!selectedImageId || isSaving}
                  className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-sky-50 disabled:opacity-50"
                >
                  Show original
                </button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
