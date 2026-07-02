// Telegram Mini App — fullscreen, no accidental swipe-to-close
(function () {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
    }

    tg.setHeaderColor('#191d32');
    tg.setBackgroundColor('#111424');
    document.documentElement.classList.add('telegram-webapp');
})();
