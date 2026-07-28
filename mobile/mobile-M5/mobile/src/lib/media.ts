import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export class MediaPermissionError extends Error {}

/**
 * Every asset — camera or library, whatever format the OS handed back
 * (iOS defaults to HEIC for camera captures and for many library photos) —
 * is run through ImageManipulator and re-saved as JPEG. This is
 * unconditional rather than a "check the extension first" branch: relying
 * on `asset.mimeType`/filename to decide whether conversion is needed is
 * exactly the kind of unverified assumption M3's brief calls out, and
 * re-encoding an already-JPEG image is cheap. Uses the current
 * context/chainable API (`ImageManipulator.manipulate(...).renderAsync()`),
 * not the deprecated `manipulateAsync` — confirmed against the installed
 * expo-image-manipulator@57 type definitions, not guessed.
 */
async function convertToJpeg(uri: string): Promise<{ uri: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(uri);
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return { uri: result.uri, width: result.width, height: result.height };
}

interface CapturedAsset {
  uri: string;
  width: number;
  height: number;
  originalMimeType: string | null;
}

async function processResult(result: ImagePicker.ImagePickerResult): Promise<CapturedAsset | null> {
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const converted = await convertToJpeg(asset.uri);
  return {
    uri: converted.uri,
    width: converted.width,
    height: converted.height,
    originalMimeType: asset.mimeType ?? null,
  };
}

/** Requests camera permission and launches the camera. Returns null if the user cancels. */
export async function captureCasePhoto(): Promise<CapturedAsset | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new MediaPermissionError('Camera access is off for Armature Labs. Enable it in Settings to take a photo.');
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  return processResult(result);
}

/** Requests photo library permission and launches the picker. Returns null if the user cancels. */
export async function pickCasePhotoFromLibrary(): Promise<CapturedAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MediaPermissionError(
      'Photo library access is off for Armature Labs. Enable it in Settings to choose a photo.'
    );
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
  });
  return processResult(result);
}
