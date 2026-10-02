import { supabase } from './supabase';

const STORAGE_BUCKET = 'student-photos';
const MAX_DIMENSION = 600;
const JPEG_QUALITY = 0.82;

/**
 * Compresses and resizes an image file in the browser before uploading to Supabase Storage.
 * Never returns or stores Base64 in PostgreSQL.
 */
export async function compressImageFile(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to initialize image compression context.'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Image compression failed.'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        JPEG_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Invalid image file selected.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Uploads a compressed student photo to Supabase Storage and updates `students.photo_url`
 * with the public Storage URL (never Base64).
 */
export async function uploadStudentPhoto(
  schoolId: string,
  studentUuid: string,
  file: File
): Promise<string> {
  const compressedBlob = await compressImageFile(file);
  const filePath = `${schoolId}/${studentUuid}-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, compressedBlob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  const photoUrl = publicUrlData.publicUrl;

  const { error: updateError } = await supabase
    .from('students')
    .update({ photo_url: photoUrl })
    .eq('id', studentUuid)
    .eq('school_id', schoolId);

  if (updateError) {
    throw updateError;
  }

  return photoUrl;
}
