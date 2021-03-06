import $ from 'jquery';
import _ from 'lodash';

import * as Modules from '@kaetram/common/src/modules';

import install from './lib/pwa';
import { isMobile, isTablet } from './utils/detect';

import type Game from './game';

export interface Config {
    /** Server host */
    ip: string;
    /** Server port */
    port: number;
    /** Game version on the server */
    version: string;
    /** Use HTTPS */
    ssl: boolean;
    debug: boolean;
    worldSwitch: boolean;
}

export default class App {
    // Do not refactor env variables assignment
    // `process.env.VARIABLE` is replaced by webpack during build process
    public config: Config = {
        ip: process.env.IP!,
        port: parseInt(process.env.PORT!),
        version: process.env.VERSION!,
        ssl: !!process.env.SSL,
        debug: import.meta.env.DEV,
        worldSwitch: !!process.env.WORLD_SWITCH
    };

    public body = $('body');

    private parchment = $('#parchment');
    private window = $(window);

    public canvas = $('#canvas');
    public border = $('#border');

    private forms = $('#intro form');

    private loginButton = $('#login');
    // private createButton = $('#play');
    private registerButton = $('#newCharacter');
    private helpButton = $('#helpButton');
    private cancelButton = $('#cancelButton');
    private loading = $('.loader');

    private respawn = $('#respawn');

    private rememberMe = $('#rememberMe input');
    private guest = $('#guest input');

    private about = $('#toggle-about');
    private credits = $('#toggle-credits');
    private discord = $('#toggle-discord');
    private git = $('#toggle-git');

    private footer = $('footer');

    public loginFields: JQuery<HTMLInputElement>[] = [];
    public registerFields: JQuery<HTMLInputElement>[] = [];

    public game!: Game;

    private loaded = false;

    private parchmentAnimating = false;
    private loggingIn = false;

    public statusMessage!: string | null;
    // orientation: string;

    public constructor() {
        this.sendStatus('Initializing the main app');

        // this.updateOrientation();
        this.load();
    }

    private load(): void {
        const {
            forms,
            registerButton,
            cancelButton,
            parchment,
            about,
            credits,
            discord,
            git,
            rememberMe,
            respawn,
            config,
            body,
            canvas
        } = this;

        forms.on('submit', (event) => {
            event.preventDefault();

            this.login();
        });

        registerButton.on('click', () => this.openScroll('loadCharacter', 'createCharacter'));

        cancelButton.on('click', () => this.openScroll('createCharacter', 'loadCharacter'));

        parchment.on('click', () => {
            if (
                parchment.hasClass('about') ||
                parchment.hasClass('credits') ||
                parchment.hasClass('git')
            ) {
                parchment.removeClass('about credits git');
                this.displayScroll('loadCharacter');
            }
        });

        about.on('click', () => this.displayScroll('about'));

        credits.on('click', () => this.displayScroll('credits'));

        discord.on('click', () => window.open('https://discord.gg/MmbGAaw'));

        git.on('click', () => this.displayScroll('git'));

        rememberMe.on('change', () => {
            const { game } = this;

            if (!game.storage) return;

            const active = rememberMe.prop('checked');

            game.storage.toggleRemember(!active);
        });

        respawn.on('click', () => {
            const { game } = this;

            if (game.player.dead) game.respawn();
        });

        window.scrollTo(0, 1);

        this.window.on('resize', () => this.game.resize());

        // Default Server ID
        if (!window.localStorage.getItem('world'))
            window.localStorage.setItem('world', 'kaetram_server01');

        if (config.worldSwitch)
            $.get('https://hub.kaetram.com/all', (servers) => {
                let serverIndex = 0;
                for (const [i, server] of servers.entries()) {
                    const row = $(document.createElement('tr'));
                    row.append($(document.createElement('td')).text(server.serverId));
                    row.append(
                        $(document.createElement('td')).text(
                            `${server.playerCount}/${server.maxPlayers}`
                        )
                    );
                    $('#worlds-list').append(row);
                    row.on('click', () => {
                        // TODO: This is when a server is clicked with the local `server` having the world data.
                        // log.info(server);
                    });

                    if (server.serverId === window.localStorage.getItem('world')) serverIndex = i;
                }
                const currentWorld = servers[serverIndex];

                $('#current-world-index').text(serverIndex);
                $('#current-world-id').text(currentWorld.serverId);
                $('#current-world-count').text(
                    `${currentWorld.playerCount}/${currentWorld.maxPlayers}`
                );

                $('#worlds-switch').on('click', () => $('#worlds-popup').toggle());
            });

        $(document).on('keydown', ({ which }) => which !== Modules.Keys.Enter);

        $(document).on('keydown', ({ which, keyCode }) => {
            const key = which || keyCode || 0,
                { game } = this;

            if (!game) return;

            body.trigger('focus');

            if (game.started) game.handleInput(Modules.InputType.Key, key);
            else if (key === Modules.Keys.Enter) this.login();
        });

        $(document).on('keyup', ({ which }) => {
            const { game } = this,
                key = which;

            if (!game || !game.started) return;

            game.input.keyUp(key);
        });

        $(document).on('mousemove', (event: JQuery.MouseMoveEvent<Document>) => {
            const { game } = this;

            if (!game || !game.input || !game.started || event.target.id !== 'textCanvas') return;

            game.input.setCoords(event);
            game.input.moveCursor();
        });

        $('body').on('contextmenu', '#canvas', (event) => {
            this.game.input.handle(Modules.InputType.RightClick, event);

            return false;
        });

        canvas.on('click', (event) => {
            const { game } = this;

            if (!game || !game.started || event.button !== 0) return;

            window.scrollTo(0, 1);

            game.input.handle(Modules.InputType.LeftClick, event);
        });

        $('input[type="range"]').on('input', (_e, input: HTMLInputElement) =>
            this.updateRange($(input))
        );

        if (!this.config.debug && location.hostname !== 'localhost')
            $.ajax({
                url: 'https://c6.patreon.com/becomePatronButton.bundle.js',
                dataType: 'script',
                async: true
            });
    }

    public ready(): void {
        this.sendStatus(null);

        this.loaded = true;

        this.loginButton.prop('disabled', false);
    }

    private login(): void {
        const { loggingIn, loaded, statusMessage, game } = this;

        if (loggingIn || !loaded || statusMessage || !this.verifyForm()) return;

        this.toggleLogin(true);
        game.connect();

        install();
    }

    public fadeMenu(): void {
        const { body, footer } = this;

        this.updateLoader(null);

        window.setTimeout(() => {
            body.addClass('game');
            body.addClass('started');

            body.removeClass('intro');

            footer.hide();
        }, 500);
    }

    public showMenu(): void {
        const { body, footer } = this;

        body.removeClass('game');
        body.removeClass('started');
        body.addClass('intro');

        footer.show();
    }

    // showDeath(): void {}

    public openScroll(origin: string | undefined, destination: string): void {
        const { loggingIn, parchmentAnimating, parchment } = this;

        if (!destination || loggingIn) return;

        this.cleanErrors();

        if (!isMobile()) {
            if (parchmentAnimating) return;

            this.parchmentAnimating = true;

            parchment.toggleClass('animate').removeClass(origin);

            window.setTimeout(
                () => {
                    parchment.toggleClass('animate').addClass(destination);
                    this.parchmentAnimating = false;

                    $(`#${destination} input`)[0]?.focus();
                },
                isTablet() ? 0 : 1000
            );
        } else parchment.removeClass(origin).addClass(destination);
    }

    private displayScroll(content: string): void {
        const { parchment, game, body, helpButton } = this,
            state = parchment.attr('class');

        if (game.started) {
            parchment.removeClass().addClass(content);

            body.removeClass('credits legal about').toggleClass(content);

            if (game.player) body.toggleClass('death');

            if (content !== 'about') helpButton.removeClass('active');
        } else if (state !== 'animate')
            this.openScroll(state, state === content ? 'loadCharacter' : content);
    }

    private verifyForm(): boolean {
        const activeForm = this.getActiveForm();

        if (activeForm === 'null') return false;

        switch (activeForm) {
            case 'loadCharacter': {
                const nameInput: JQuery<HTMLInputElement> = $('#loginNameInput'),
                    passwordInput: JQuery<HTMLInputElement> = $('#loginPasswordInput');

                if (this.loginFields.length === 0) this.loginFields = [nameInput, passwordInput];

                if (!nameInput.val() && !this.isGuest()) {
                    this.sendError(nameInput, 'Please enter a username.');
                    return false;
                }

                if (!passwordInput.val() && !this.isGuest()) {
                    this.sendError(passwordInput, 'Please enter a password.');
                    return false;
                }

                break;
            }

            case 'createCharacter': {
                const characterName: JQuery<HTMLInputElement> = $('#registerNameInput'),
                    registerPassword: JQuery<HTMLInputElement> = $('#registerPasswordInput'),
                    registerPasswordConfirmation: JQuery<HTMLInputElement> = $(
                        '#registerPasswordConfirmationInput'
                    ),
                    email: JQuery<HTMLInputElement> = $('#registerEmailInput');

                if (this.registerFields.length === 0)
                    this.registerFields = [
                        characterName,
                        registerPassword,
                        registerPasswordConfirmation,
                        email
                    ];

                if (!characterName.val()) {
                    this.sendError(characterName, 'A username is necessary you silly.');
                    return false;
                }

                if (!registerPassword.val()) {
                    this.sendError(registerPassword, 'You must enter a password.');
                    return false;
                }

                if (registerPasswordConfirmation.val() !== registerPassword.val()) {
                    this.sendError(registerPasswordConfirmation, 'The passwords do not match!');
                    return false;
                }

                if (!email.val() || !this.verifyEmail(email.val() as string)) {
                    this.sendError(email, 'An email is required!');
                    return false;
                }

                break;
            }
        }

        return true;
    }

    private verifyEmail(email: string): boolean {
        return /^(([^\s"(),.:;<>@[\\\]]+(\.[^\s"(),.:;<>@[\\\]]+)*)|(".+"))@((\[(?:\d{1,3}\.){3}\d{1,3}])|(([\dA-Za-z-]+\.)+[A-Za-z]{2,}))$/.test(
            email
        );
    }

    public sendStatus(message: string | null): void {
        this.cleanErrors();

        this.statusMessage = message;

        if (!message) return;

        $('<span></span>', {
            class: 'status blink',
            text: message
        }).appendTo('.validation-summary');

        $('.status').append(
            '<span class="loader__dot">.</span><span class="loader__dot">.</span><span class="loader__dot">.</span>'
        );
    }

    public sendError(field: JQuery | null, error: string): void {
        this.cleanErrors();

        $('<span></span>', {
            class: 'validation-error blink',
            text: error
        }).appendTo('.validation-summary');

        if (!field) return;

        field.addClass('field-error').trigger('select');
        field.on('keypress', function (event) {
            field.removeClass('field-error');

            $('.validation-error').remove();

            $(this).off(event);
        });
    }

    public cleanErrors(): void {
        const activeForm = this.getActiveForm(),
            fields = activeForm === 'loadCharacter' ? this.loginFields : this.registerFields;

        for (let i = 0; i < fields.length; i++) fields[i].removeClass('field-error');

        $('.validation-error').remove();
        $('.status').remove();
    }

    private getActiveForm() {
        return this.parchment[0].className as 'null' | 'loadCharacter' | 'createCharacter';
    }

    public isRegistering(): boolean {
        return this.getActiveForm() === 'createCharacter';
    }

    public isGuest(): boolean {
        return this.guest.prop('checked');
    }

    public setGame(game: Game): void {
        this.game = game;
    }

    public getScaleFactor(): number {
        return 3;
    }

    public getUIScale(): number {
        const width = window.innerWidth,
            height = window.innerHeight;

        return width <= 1000 ? 1 : width <= 1500 || height <= 870 ? 2 : 3;
    }

    private revertLoader(): void {
        this.updateLoader('Connecting');
    }

    public updateLoader(message: string | null): void {
        const { loading } = this;

        if (message) {
            const dots =
                '<span class="loader__dot">.</span><span class="loader__dot">.</span><span class="loader__dot">.</span>';

            loading.html(message + dots);
        } else loading.html('');
    }

    public toggleLogin(toggle: boolean): void {
        const { loading, loginButton, registerButton } = this;

        this.revertLoader();

        this.toggleTyping(toggle);

        this.loggingIn = toggle;

        if (toggle) loading.removeAttr('hidden');
        else loading.attr('hidden', 'true');

        loginButton.prop('disabled', toggle);
        registerButton.prop('disabled', toggle);
    }

    private toggleTyping(state: boolean): void {
        const { loginFields, registerFields } = this;

        if (loginFields) _.each(loginFields, (field) => field.prop('readonly', state));

        if (registerFields) _.each(registerFields, (field) => field.prop('readOnly', state));
    }

    public updateRange(obj: JQuery<HTMLInputElement>): void {
        const min = parseInt(obj.attr('min')!),
            max = parseInt(obj.attr('max')!),
            val = (parseInt(obj.val() as string) - min) / (max - min);

        obj.css({
            backgroundImage: `-webkit-gradient(linear, left top, right top, color-stop(${val}, #4d4d4d), color-stop(${val}, #c5c5c5))`
        });
    }

    // updateOrientation(): void {
    //     this.orientation = this.getOrientation();
    // }

    // getOrientation(): 'portrait' | 'landscape' {
    //     return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
    // }
}
