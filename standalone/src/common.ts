export function getCallID() {
    const params = new URLSearchParams(window.location.search);
    return params.get('call_id');
}

export function getCallTitle() {
    const params = new URLSearchParams(window.location.search);
    return params.get('title') || '';
}

export function getToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
}
