window.addEventListener('load', function(){
    const lis = document.querySelectorAll('header nav li');
    let path = location.pathname.slice(1);
    if (path.length === 0){ path = 'index'; }
    path = 'html_' + path;
    for (let i = 0; i < lis.length; i++){
        if (lis[i].classList.contains(path)){
            lis[i].classList.add('selected');
            break;
        }
    }
});
