export class UrlHelper {
    static getSearchParams() {
        const queryString = window.location.href.split('?').pop();
        return new URLSearchParams(queryString);
    }
}
