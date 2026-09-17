const API_BASE = '/api/auth/';

async function formDataToJson(formData) {
  const entries = await Promise.all([...formData.entries()].map(async ([key, value]) => {
    if (!(value instanceof File)) return [key, value];
    return [key, { name: value.name, type: value.type, size: value.size, data: await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(value);
    }) }];
  }));
  return JSON.stringify(Object.fromEntries(entries));
}

export async function api(route, options = {}) {
  const isFormData = options.body instanceof FormData;
  const body = isFormData ? await formDataToJson(options.body) : options.body;
  let response;
  try {
    response = await fetch(`${API_BASE}${route}`, {
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
      ...options,
      body
    });
  } catch (error) {
    throw new Error('Backend belum berjalan. Jalankan server aplikasi terlebih dahulu.');
  }
  let result;
  const rawResponse = response.clone();
  try {
    result = await response.json();
  } catch (error) {
    const rawText = await rawResponse.text().catch(() => '');
    throw new Error(rawText.trim() || `Server mengembalikan respons tidak valid (${response.status}).`);
  }
  if (!response.ok || !result.success) throw new Error(result.message || 'Permintaan gagal');
  return result;
}
