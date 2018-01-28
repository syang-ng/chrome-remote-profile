formatDate = function (date) {
    const y = date.getFullYear();
    let m = date.getMonth() + 1;
    m = m < 10 ? '0' + m : m;
    let d = date.getDate();
    d = d < 10 ? ('0' + d) : d;
    return y + '-' + m + '-' + d;
};

formatTime = function (date) {
    let h = date.getHours();
    h = h < 10 ? '0' + h : h;
    let m = date.getMinutes();
    m = m < 10 ? '0' + m : m;
    let s = date.getSeconds();
    s = s < 10 ? '0' + s : s;
    return h + ':' + m + ':' + s;
};

formatDateTime = function (date) {
    const fDate = formatDate(date);
    const fTime = formatTime(date);
    return fDate + ' ' + fTime;
};

exports.formatDate = formatDate;
exports.formatTime = formatTime;
exports.formatDateTime = formatDateTime;