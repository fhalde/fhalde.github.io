'use strict'

function currentScrollTop() {
    return (window.pageYOffset || document.documentElement.scrollTop) - (document.documentElement.clientTop || 0);
}

var events = [{
    content: 'Born',
    date: 'March 1994'
}, {
    content: 'High school graduation',
    date: 'March 2011'
}, {
    content: 'Internship at IBM',
    date: 'June 2014'
}, {
    content: 'College graduation',
    date: 'July 2015'
}, {
    content: 'Joined PayPal Inc',
    date: 'July 2015'
}];

var circles$ = Rx.Observable.merge(
    ...[0,1,2,3,4,5,6,7,8]
        .map(
            (e, i) => {
                var node = document.createElement('div');
                var parent = document.getElementsByClassName('timedot')[0];
                node.className = i % 2 == 0 ? 'circles' : 'lines';
                parent.appendChild(node);
                return i % 2 == 0 ? {node, i} : undefined;
        })
        .filter((i) => {return (typeof i !== 'undefined')})
        .map(({node, i}) => {
            return Rx.Observable.merge(
                Rx.Observable.fromEvent(node, 'mouseover').mapTo(i / 2),
                Rx.Observable.fromEvent(node, 'mouseout').mapTo(undefined)
            );
        })
).subscribe((i) => {
    var ev_name = document.getElementsByClassName('event-name')[0];
    if(typeof i !== 'undefined') {
        ev_name.innerHTML = `${events[i].content}<br /><span style='font-size: 18px'>${events[i].date}</span>`;
        ev_name.style.opacity = 1;
    } else {
        ev_name.style.opacity = 0;
    }
});

var colors = ['#2196f3', '#fafafa'];
var titles = ['', 'ABOUT ME', 'SKILLS', 'TIMELINE', 'WEB PRESENCE'];

var scroll$ = Rx.Observable.fromEvent(document, 'scroll')
    .map(currentScrollTop)
    .startWith(currentScrollTop());

var titles$ = Rx.Observable.merge(
    ...[].map.call(
        document.getElementsByClassName('sections'),
        (div, ind) => {
            return scroll$
                .filter((top) => {
                    return div.offsetTop <= top && (top < (div.offsetTop + div.clientHeight))
                })
                .map(() => {
                    return {
                        title: titles[ind],
                        color: colors[ind % 2],
                        opacity: 1 - (currentScrollTop() - div.offsetTop) / div.clientHeight
                    }
                })
        })
    )
.subscribe((title) => {
    var header = document.getElementsByClassName('headers')[0];
    header.innerHTML = title.title;
    header.style.color = title.color;
    header.style.opacity = title.opacity;
    header.style.transform = 'scale(' + title.opacity + ')';
});
