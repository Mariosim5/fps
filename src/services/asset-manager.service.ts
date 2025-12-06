import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AssetManagerService {
  private http = inject(HttpClient);
  private validationCache = new Map<string, Promise<string | null>>();

  /**
   * Validates a URL by making a HEAD request. Caches results.
   * Returns the URL if valid, otherwise null.
   * @param url The URL to validate.
   * @returns A promise that resolves to the valid URL or null.
   */
  resolveModelUrl(url: string | null | undefined): Promise<string | null> {
    if (!url || !url.startsWith('https') || !url.endsWith('.glb')) {
      return Promise.resolve(null);
    }

    if (this.validationCache.has(url)) {
      return this.validationCache.get(url)!;
    }

    const validationPromise = firstValueFrom(
      this.http.head(url, { observe: 'response' }).pipe(
        map((response: HttpResponse<any>) => {
          console.log(`AssetManager: Validation success for ${url} (${response.status})`);
          return response.ok ? url : null;
        }),
        catchError(error => {
          console.warn(`AssetManager: Validation failed for ${url} (${error.status})`);
          return of(null);
        })
      )
    );

    this.validationCache.set(url, validationPromise);
    return validationPromise;
  }
}
