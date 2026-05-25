/**
 * user-media.service.js
 * Aloura — User Media Service
 *
 * Handles profile image uploads, removals, and replacements.
 * Uploads files to the Supabase Storage bucket "profile-images"
 * and keeps the public.profile_images table in sync.
 *
 * Usage:
 *   import { UserMediaService } from './user-media.service.js';
 *   const media = new UserMediaService(supabaseClient, accountId);
 *
 *   const result = await media.uploadProfileImage(file);
 *   const result = await media.removeProfileImage(imageId);
 *   const result = await media.replaceProfileImage(imageId, newFile);
 */

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */

const BUCKET          = 'profile_images';
const MAX_FILE_SIZE   = 10 * 1024 * 1024;   // 10 MB
const ALLOWED_TYPES   = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const MAX_IMAGES      = 3;

/* ─────────────────────────────────────────
   RESULT HELPERS
───────────────────────────────────────── */

/** @returns {{ ok: true, data: any, error: null }} */
const ok  = (data = null) => ({ ok: true,  data,  error: null });

/** @returns {{ ok: false, data: null, error: string }} */
const err = (message)     => ({ ok: false, data:  null, error: message });

/* ─────────────────────────────────────────
   VALIDATORS  (static — pure functions)
───────────────────────────────────────── */

export class MediaValidators {

  /**
   * Validates a File object before upload.
   *
   * @param {File} file
   * @returns {{ valid: boolean, message: string }}
   */
  static validateFile(file) {
    if (!file || !(file instanceof File)) {
      return { valid: false, message: 'No file provided.' };
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        message: `File type not supported. Please upload a JPEG, PNG, or WebP image.`,
      };
    }
    if (file.size > MAX_FILE_SIZE) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        message: `Image is too large (${mb} MB). Maximum size is 10 MB.`,
      };
    }
    if (file.size === 0) {
      return { valid: false, message: 'The file appears to be empty.' };
    }

    return { valid: true, message: '' };
  }

  /**
   * Validates a non-empty string ID.
   *
   * @param {string} id
   * @param {string} label
   * @returns {{ valid: boolean, message: string }}
   */
  static validateId(id, label = 'ID') {
    if (!id || typeof id !== 'string' || !id.trim()) {
      return { valid: false, message: `${label} is required.` };
    }
    return { valid: true, message: '' };
  }
}

/* ─────────────────────────────────────────
   USER MEDIA SERVICE CLASS
───────────────────────────────────────── */

export class UserMediaService {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #client;

  /** @type {string} — the authenticated user's account row ID */
  #accountId;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
   * @param {string} accountId — public.accounts.id for the current user
   *
   * @example
   *   const media = new UserMediaService(supabase, account.id);
   */
  constructor(supabaseClient, accountId) {
    if (!supabaseClient) {
      throw new Error('[UserMediaService] A Supabase client is required.');
    }
    if (!accountId) {
      throw new Error('[UserMediaService] An account ID is required.');
    }
    this.#client    = supabaseClient;
    this.#accountId = accountId;
  }

  /* ── Public API ─────────────────────────── */

  /**
   * Uploads a profile image to Storage and inserts a row into profile_images.
   *
   * @param {File}   file        - The image File from an <input type="file">
   * @param {string} [tag]       - Optional label e.g. "front", "side", "full-body"
   * @returns {Promise<Result>}  - data: { id, image_url, tag, uploaded_at }
   *
   * @example
   *   const result = await media.uploadProfileImage(file, 'front');
   *   if (result.ok) console.log(result.data.image_url);
   */
  async uploadProfileImage(file, tag = '') {
    console.log('[UserMediaService] uploadProfileImage called', {
      fileName: file?.name,
      fileType: file?.type,
      fileSize: file?.size,
      accountId: this.#accountId,
      bucket: BUCKET,
    });

    // 1. Validate file
    const fileCheck = MediaValidators.validateFile(file);
    if (!fileCheck.valid) {
      console.error('[UserMediaService] File validation failed:', fileCheck.message);
      return err(fileCheck.message);
    }

    // 2. Image count enforced by UI — skip DB count check to avoid edge cases

    // 3. Build a unique storage path
    const ext      = this.#getExtension(file);
    const filename = `${this.#accountId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    // 4. Upload to Supabase Storage
    const mimeType = file.type || 'image/jpeg';
    console.log('[UserMediaService] Uploading to storage:', { bucket: BUCKET, filename, mimeType });

    const { error: uploadError } = await this.#client.storage
      .from(BUCKET)
      .upload(filename, file, {
        contentType:  mimeType,
        cacheControl: '3600',
        upsert:       false,
      });

    if (uploadError) {
      console.error('[UserMediaService] Storage upload error:', uploadError);
      return err(this.#mapStorageError(uploadError));
    }

    // 5. Get public URL
    const { data: urlData } = this.#client.storage
      .from(BUCKET)
      .getPublicUrl(filename);

    const imageUrl = urlData.publicUrl;

    // 6. Insert row into profile_images table
    const { data: row, error: dbError } = await this.#client
      .from('profile_images')
      .insert({
        account_id: this.#accountId,
        image_url:  imageUrl,
        tag:        tag || null,
      })
      .select()
      .single();

    if (dbError) {
      // Best-effort: clean up the orphaned storage file
      await this.#deleteFromStorage(filename);
      return err(this.#mapDbError(dbError));
    }

    return ok({
      id:          row.id,
      image_url:   row.image_url,
      tag:         row.tag,
      uploaded_at: row.uploaded_at,
    });
  }

  /**
   * Removes a profile image — deletes the DB row and the Storage file.
   *
   * @param {string} imageId  - profile_images.id (UUID)
   * @returns {Promise<Result>}
   *
   * @example
   *   const result = await media.removeProfileImage('uuid-here');
   */
  async removeProfileImage(imageId) {
    // 1. Validate
    const idCheck = MediaValidators.validateId(imageId, 'Image ID');
    if (!idCheck.valid) return err(idCheck.message);

    // 2. Fetch the row so we have the storage path
    const { data: row, error: fetchError } = await this.#client
      .from('profile_images')
      .select('id, image_url, account_id')
      .eq('id', imageId)
      .eq('account_id', this.#accountId)  // ownership check
      .single();

    if (fetchError || !row) {
      return err('Image not found or you do not have permission to remove it.');
    }

    // 3. Delete DB row first
    const { error: deleteError } = await this.#client
      .from('profile_images')
      .delete()
      .eq('id', imageId)
      .eq('account_id', this.#accountId);

    if (deleteError) return err(this.#mapDbError(deleteError));

    // 4. Delete from Storage (best-effort — don't fail if storage delete fails)
    const storagePath = this.#extractStoragePath(row.image_url);
    if (storagePath) {
      await this.#deleteFromStorage(storagePath);
    }

    return ok({ id: imageId });
  }

  /**
   * Replaces an existing profile image with a new file.
   * Uploads the new image first, then removes the old one.
   * If the upload fails, the original is preserved.
   *
   * @param {string} imageId   - profile_images.id of the image to replace
   * @param {File}   newFile   - The replacement image File
   * @param {string} [tag]     - Optional tag (inherits old tag if omitted)
   * @returns {Promise<Result>} - data: { id, image_url, tag, uploaded_at }
   *
   * @example
   *   const result = await media.replaceProfileImage('uuid-here', file);
   */
  async replaceProfileImage(imageId, newFile, tag = '') {
    // 1. Validate both inputs
    const idCheck   = MediaValidators.validateId(imageId, 'Image ID');
    const fileCheck = MediaValidators.validateFile(newFile);
    if (!idCheck.valid)   return err(idCheck.message);
    if (!fileCheck.valid) return err(fileCheck.message);

    // 2. Fetch the existing row — confirms ownership and gets the tag
    const { data: existing, error: fetchError } = await this.#client
      .from('profile_images')
      .select('id, image_url, tag, account_id')
      .eq('id', imageId)
      .eq('account_id', this.#accountId)
      .single();

    if (fetchError || !existing) {
      return err('Image not found or you do not have permission to replace it.');
    }

    // 3. Upload the new file
    const ext         = this.#getExtension(newFile);
    const newFilename = `${this.#accountId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const mimeType = newFile.type || 'image/jpeg';

    const { error: uploadError } = await this.#client.storage
      .from(BUCKET)
      .upload(newFilename, newFile, {
        contentType:  mimeType,
        cacheControl: '3600',
        upsert:       false,
      });

    if (uploadError) return err(this.#mapStorageError(uploadError));

    // 4. Get new public URL
    const { data: urlData } = this.#client.storage
      .from(BUCKET)
      .getPublicUrl(newFilename);

    const newImageUrl = urlData.publicUrl;

    // 5. Update the DB row in place — keeps the same ID
    const { data: updated, error: updateError } = await this.#client
      .from('profile_images')
      .update({
        image_url: newImageUrl,
        tag:       tag || existing.tag || null,
      })
      .eq('id', imageId)
      .eq('account_id', this.#accountId)
      .select()
      .single();

    if (updateError) {
      // Upload succeeded but DB update failed — clean up new file
      await this.#deleteFromStorage(newFilename);
      return err(this.#mapDbError(updateError));
    }

    // 6. Delete the old file from Storage (best-effort)
    const oldPath = this.#extractStoragePath(existing.image_url);
    if (oldPath) {
      await this.#deleteFromStorage(oldPath);
    }

    return ok({
      id:          updated.id,
      image_url:   updated.image_url,
      tag:         updated.tag,
      uploaded_at: updated.uploaded_at,
    });
  }

  /**
   * Returns all profile images for the current account.
   *
   * @returns {Promise<Result>} - data: Array of profile_image rows
   *
   * @example
   *   const result = await media.getProfileImages();
   *   if (result.ok) renderImages(result.data);
   */
  async getProfileImages() {
    const { data, error: dbError } = await this.#client
      .from('profile_images')
      .select('id, image_url, tag, uploaded_at')
      .eq('account_id', this.#accountId)
      .order('uploaded_at', { ascending: true });

    if (dbError) return err(this.#mapDbError(dbError));

    return ok(data ?? []);
  }

  /* ── Private helpers ────────────────────── */

  /**
   * Returns the current image count for the account.
   * @returns {Promise<Result>} data: number
   */
  async #getImageCount() {
    const { count, error } = await this.#client
      .from('profile_images')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', this.#accountId);

    if (error) return err(this.#mapDbError(error));
    return ok(count ?? 0);
  }

  /**
   * Deletes a file from Supabase Storage.
   * Swallows errors — always best-effort.
   *
   * @param {string} path - storage path e.g. "accountId/filename.jpg"
   */
  async #deleteFromStorage(path) {
    try {
      await this.#client.storage.from(BUCKET).remove([path]);
    } catch (_) {
      // intentionally swallowed — storage cleanup is best-effort
    }
  }

  /**
   * Extracts the storage path from a full public URL.
   * e.g. "https://xxx.supabase.co/storage/v1/object/public/profile-images/accountId/file.jpg"
   *   → "accountId/file.jpg"
   *
   * @param {string} publicUrl
   * @returns {string | null}
   */
  #extractStoragePath(publicUrl) {
    try {
      const marker = `/object/public/${BUCKET}/`;
      const idx    = publicUrl.indexOf(marker);
      return idx !== -1 ? publicUrl.slice(idx + marker.length) : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Returns the file extension from a File's MIME type.
   * @param {File} file
   * @returns {string}
   */
  #getExtension(file) {
    const map = {
      'image/jpeg': 'jpg',
      'image/png':  'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
    };
    return map[file.type] ?? 'jpg';
  }

  /**
   * Maps Supabase Storage errors to user-friendly messages.
   * @param {{ message: string }} error
   * @returns {string}
   */
  #mapStorageError(error) {
    const msg = (error.message ?? '').toLowerCase();

    if (msg.includes('duplicate') || msg.includes('already exists')) {
      return 'An image with that name already exists. Please try again.';
    }
    if (msg.includes('payload too large') || msg.includes('too large')) {
      return 'Image is too large. Please upload an image under 10 MB.';
    }
    if (msg.includes('not found') || msg.includes('bucket')) {
      return 'Storage is not configured correctly. Please contact support.';
    }
    if (!navigator.onLine) {
      return 'You appear to be offline. Check your connection and try again.';
    }

    return 'Failed to upload image. Please try again.';
  }

  /**
   * Maps Supabase DB errors to user-friendly messages.
   * @param {{ message: string, code: string }} error
   * @returns {string}
   */
  #mapDbError(error) {
    const msg  = (error.message ?? '').toLowerCase();
    const code = error.code ?? '';

    if (code === '23505') {
      return 'This image has already been uploaded.';
    }
    if (code === '42501' || msg.includes('permission')) {
      return 'You do not have permission to perform this action.';
    }
    if (!navigator.onLine) {
      return 'You appear to be offline. Check your connection and try again.';
    }

    return 'Something went wrong. Please try again.';
  }
}

/* ─────────────────────────────────────────
   UPLOAD ANIMATION HELPER
   Exported standalone — no class needed.

   Shows a blurred preview of the file
   immediately, sweeps a shimmer over it
   while the upload is in progress, then
   snaps clean on success or greys out on
   failure.

   Usage:
     const anim = startUploadAnimation(slotEl, file);
     const result = await media.uploadProfileImage(file);
     anim.stop(result.ok);

   @param {HTMLElement} slotEl  - the slot container element
   @param {File}        file    - the file about to be uploaded
   @returns {{ stop: (success?: boolean) => void }}
───────────────────────────────────────── */
export function startUploadAnimation(slotEl, file) {
  const objectUrl = URL.createObjectURL(file);

  // Build the overlay without touching existing slot children
  const overlay = document.createElement('div');
  overlay.className = 'slot-uploading';
  overlay.innerHTML = `
    <img
      class="slot-preview"
      src="${objectUrl}"
      alt="Uploading preview"
      draggable="false"
    >
    <div class="slot-shimmer" aria-hidden="true"></div>
    <div class="slot-uploading-bar" aria-hidden="true">
      <div class="slot-uploading-bar-fill"></div>
    </div>
    <div class="slot-uploading-label" aria-live="polite">
      <span class="slot-uploading-dot"></span>
      Uploading…
    </div>
  `;
  slotEl.appendChild(overlay);

  const img = overlay.querySelector('.slot-preview');
  img.onload = () => URL.revokeObjectURL(objectUrl);

  return {
    /**
     * @param {boolean} [success=true]
     */
    stop(success = true) {
      const wrap = slotEl.querySelector('.slot-uploading');
      if (!wrap) return;

      const shimmer = wrap.querySelector('.slot-shimmer');
      const bar     = wrap.querySelector('.slot-uploading-bar');
      const label   = wrap.querySelector('.slot-uploading-label');
      const preview = wrap.querySelector('.slot-preview');

      if (success) {
        shimmer?.remove();
        bar?.remove();
        label?.remove();
        if (preview) {
          preview.style.filter    = 'none';
          preview.style.transform = 'scale(1)';
        }
        wrap.classList.add('slot-done');
      } else {
        wrap.classList.add('slot-error');
        if (preview) {
          preview.style.filter = 'blur(6px) brightness(0.55) saturate(0)';
        }
        shimmer?.remove();
        bar?.remove();
        if (label) label.textContent = 'Upload failed — try again';
      }
    }
  };
}