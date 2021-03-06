import { global, logger } from './util.js';

interface AdimaData {
  vLines: VLine[],
  hLines: HLines,
  innerHTML: string, // TODO getter
  activeVlineIdx: number,
  players: Player[],
  goals: Goal[],
}
interface HLines {
  [key: string]: HLine,
}
interface VLine {
  position: { x: number },
  routes: VLineRoutes,
  startRoute: string | null,
}
interface VLineRoutes {
  [key: string]: VLineRoute, // HLine.key value is used as this key value
}
interface VLineRoute {
  nextKey: string | null,
  prevKey: string | null,
  lr: VLineRouteLR,
}
type VLineRouteLR = -1 | 1;
interface HLine {
  key: string
  position: HLinePos,
  ownerIdx: number,
}
interface HLinePos extends Pozition{
}
interface Player {
  name: string,
  path: Path,
  goalIdx?: string | number,
}
type Path = Pozition[];
interface Pozition {
  x: number,
  y: number,
}
interface Goal {
  label: string,
  order?: number,
}
interface InitOptions {
  height?: number,
  width?: number,
  headerHeight?: number,
  footerHeight?: number,
  numVLines?: number,
  numHLines?: number,
  colors?: string[],
  ctxMenuHandlers?: CtxMenuHandlers,
}
type CtxMenuHandler = (evt: Event, adima: Adima) => void;
type CtxMenuHandlers = {[label: string]: CtxMenuHandler};

class VLine implements VLine {
  private LINE_SPAN;
  public routes = {} as VLineRoutes;
  constructor(props) {
    Object.keys(props).forEach(key => {
      this[key] = props[key];
    })
  }
  public get boundary(): {x1:number, x2:number} {
    return { x1: this.position.x - (this.LINE_SPAN/2), x2: this.position.x + (this.LINE_SPAN/2) };
  }
}
class HLinePos implements HLinePos {
  private MIN_Y;
  private MAX_Y;
  constructor(props) {
    Object.keys(props).forEach(key => {
      this[key] = props[key];
    })
  }
  public get adjustedY(): number { // returns valid y position in the content area
    return this.y < this.MIN_Y ? this.MIN_Y :
            (this.MAX_Y < this.y ? this.MAX_Y : this.y)
  }
}

const DEFAULTCOLORS = [
  'RED',
  'TEAL',
  'OLIVE',
  'LIME',
  'ORANGE',
  'FUCHSIA',
  'MAROON',
  'AQUA',
  'BLUE',
  'PINK',
  'GREEN',
  'NAVY',
  'PURPLE',
  'GRAY',
];

const DEFAULTCTXMENUHANDLERS = {
  'Start': async (evt, adima) => {
    if (adima.isPlaying) return;
    adima.setPlaying();
    if (adima.data.players[0].path.length > 0) adima.clearPath(); // In case already paths have bean rendered
    await adima.startAdima();
    adima.unsetPlaying();
  },
  'Add a virtical line': (evt, adima) => {
    adima.addVLine();
  },
  'Add a horizontal line': (evt, adima) => {
    const menuElm = document.getElementById('adima-menu') as HTMLElement;
    const position = {
      x: menuElm.getBoundingClientRect().left - (document.getElementById('adima-vline0') as Element).getBoundingClientRect().left,
      y: menuElm.getBoundingClientRect().top - (document.getElementById('adima-main-container') as Element).getBoundingClientRect().top,
    };
    adima.addHLine(position);
  },
  'Remove a virtical line': (evt, adima) => {
    if (adima.isPlaying || adima.isShuffling) return;
    if (adima.data.players[0].path.length > 0) adima.clearPath(); // In case already paths have bean rendered
    adima.removeVLine();
  },
  'Clear': (evt, adima) => adima.clearPath(),
  'Shuffle goals': async (evt, adima) => {
    if (adima.isShuffling) return;
    adima.setShuffling();
    if (adima.data.players[0].path.length > 0 && !adima.isPlaying) adima.clearPath(); // In case already paths have bean rendered
    adima.hideGoals();
    await adima.shuffleGoals();
    adima.unsetShuffling();
  },
};

class Adima {
  constructor(targetElm: Element) {
    this.targetElm = targetElm;
  }
  public data: AdimaData;
  public ctxMenuHandlers: CtxMenuHandlers;
  private colors: string[];
  public get numVLines() : number {
    // return this.data?.vLines?.length;
    return this._numVLines;
  }
  // public set numVLines(newNum: number) {
  //   this.addVLines(newNum - this.numVLines);
  // }
  public get numHLines() : number{
    // return this.data ? Object.keys(this.data.hLines).length : this._numHLines;
    return this._numHLines;
  }
  // public set numHLines(num: number) {
  //   this.addHLinesRandomly(num - this.numHLines);
  // }
  public get height() {
    return this._height;
  }
  // public setHeight(num: number) {
  //   this._height = num;
  //   const svgElm = document.getElementById('adima-svg') as unknown as SVGElement
  //   const rectElm = document.getElementById('adima-bg-rect') as unknown as SVGElement
  //   svgElm.setAttribute('height', ''+this.height);
  //   rectElm.setAttribute('height', ''+this.vLineHeight);
  // }
  public get width() {
    return this._width;
  }
  // public setWidth(num: number) {
  // }
  public get headerHeight() {
    return this._headerHeight;
  }
  public get footerHeight() {
    return this._footerHeight;
  }
  private _height: number;
  private _width: number;
  private _headerHeight: number;
  private _footerHeight: number;
  private _numVLines: number;
  private _numHLines: number;
  public get lineSpan() : number {
    return this.width/this.numVLines;
  }
  public get vLineHeight() : number {
    return this.height - (this.headerHeight+this.footerHeight+this.MARGIN_Y);
  }
  public get vLineMarginHeight() : number {
    return (this.vLineHeight * this.VLINE_MARGIN_HEIGHT_RATIO) / 2;
  }
  public get vLineContentHeight() : number {
    return this.vLineHeight - (this.vLineMarginHeight * 2);
  }
  public get vLineContentTop() : number {
    return this.vLineMarginHeight;
  }
  public get vLineContentBottom() : number {
    return this.vLineHeight - this.vLineMarginHeight;
  }
  public get isPlaying() : number {
    return this._isPlaying;
  }
  public setPlaying() : void {
    this._isPlaying++;
  }
  public unsetPlaying() : void {
    this._isPlaying--;
  }
  public get isShuffling() : number {
    return this._isShuffling;
  }
  public setShuffling() : void {
    this._isShuffling++;
  }
  public unsetShuffling() : void {
    this._isShuffling--;
  }
  private _isPlaying = 0;
  private _isShuffling = 0;
  private targetElm: Element;
  private readonly SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  private readonly NO_INDICATOR = -1;
  private readonly VLINE_MARGIN_HEIGHT_RATIO = .1;
  private readonly MARGIN_Y = 10;
  private readonly CHAR_A = 65;
  public readonly init = ({
      height = 270,
      width = 240,
      headerHeight = 30,
      footerHeight = 30,
      numVLines = 6,
      numHLines = 10,
      colors = DEFAULTCOLORS,
      ctxMenuHandlers = DEFAULTCTXMENUHANDLERS,
    }: InitOptions = {}) => {
    this._height = height;
    this._width = width;
    this._headerHeight = headerHeight;
    this._footerHeight = footerHeight;
    this._numVLines = numVLines;
    this._numHLines = numHLines;
    this.colors = colors;
    this.ctxMenuHandlers = ctxMenuHandlers;
    const vLines: VLine[] = (() => {
      const vLines: VLine[] = [];
      for(let i=0; i<this.numVLines; i++) {
        const posX = i*this.lineSpan
        vLines.push(new VLine({ position: { x: posX }, LINE_SPAN: this.lineSpan }));
      }
      return vLines;
    })();
    const hLines: HLines = (() => {
      const hLines: HLines = {}
      const timestamp = Date.now()
      for(let i=0, j=0; i<this.numHLines; i++, j++) {
        if (j >= this.numVLines - 1) j = 0;
        const key = 'adima-hline' + timestamp + i
        const y = Math.floor(Math.random() * this.vLineContentHeight) + (this.vLineContentTop);
        const newHLine = {
          key,
          position: new HLinePos({ x: vLines[j].position.x, y, MAX_Y: this.vLineContentBottom, MIN_Y: this.vLineContentTop }),
          ownerIdx: j,
        }
        hLines[key] = newHLine;
        this.addRoute(vLines, newHLine, hLines);
      }
      return hLines;
    })();
    const players = vLines.map((v, i) => {
      return { name: ''+(i+1), path: [] };
    });
    const goals = vLines.map((v, i) => {
      return { label: String.fromCharCode(this.CHAR_A+i) };
    });
    let svg = `
    <svg id="adima-svg" width="${this.width}" height="${this.height}" xmlns="${this.SVG_NAMESPACE}" >
      <style>
        .adima-hline {
          cursor: grab;
        }
        .adima-menu-container {
          box-shadow: 1px 1px 15px rgba(0,0,0,.2);
          border: solid 1px rgba(0,0,0,.2);
          display: inline-block;
          background: white;
          position: absolute;
        }
        .adima-menu-item {
          padding: .2em .4em;
        }
        .adima-menu-item:hover {
          background-color: rgba(0,0,0,.1);
          cursor: pointer;
        }
        .adima-goal {
          transition: transform 1000ms 100ms;
        }
        .adima-goal text { /* Long press on chrome mobile browser unintentionally selects a text, so we need to suppress the selection */
          -webkit-touch-callout: none; /* iOS Safari */
            -webkit-user-select: none; /* Safari */
             -khtml-user-select: none; /* Konqueror HTML */
               -moz-user-select: none; /* Old versions of Firefox */
                -ms-user-select: none; /* Internet Explorer/Edge */
                    user-select: none; /* Non-prefixed version, currently supported by Chrome, Edge, Opera and Firefox */
        }
      </style>
      <g style="stroke:rgb(0,0,0);stroke-width:2" transform="translate(${this.lineSpan/2}, ${this.MARGIN_Y/2})" >`
      svg += `
        <g id="adima-player-container" >`
        svg += players.reduce((result, next, idx) => {
          return `${result}
          <svg id="adima-player${idx}" class="adima-player" x="${vLines[idx].position.x - this.lineSpan/2}" y="0"
            width="${this.lineSpan}" height="${this.headerHeight}" >
            <svg width="100%" height="100%" >
              <foreignObject width="100%" height="100%" >
                <div class='adima-player-editable-element' style="display:none" contenteditable>${next.name}</div>
              </foreignObject>
              <text class="adima-player-text" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" >${next.name}</text>
            </svg>
          </svg>`
        }, '')
      svg += `
        </g>`
      svg += `
        <g id="adima-main-container" transform="translate(0, ${this.headerHeight})" >
          <rect id="adima-bg-rect" x="-${this.lineSpan/2}" width="${this.lineSpan*this.numVLines}" height="${this.vLineHeight}" stroke="none" fill="transparent" />` // In order for player's texts not to be selected while HLine being dragged
        svg += vLines.reduce((result, next, idx) => {
          return `${result}
          <g id="adima-vline${idx}" transform="translate(${next.position.x},0)" >
            <line x1="0" y1="0" x2="0" y2="${this.vLineHeight}" />
          </g>`
        }, '')
        svg += Object.keys(hLines).reduce((result, next) => {
          const h = hLines[next]
          return `${result}
          <g id="${h.key}" class="adima-hline" transform="translate(${h.position.x},${h.position.y})" >
            <rect class="adima-draggable-area" y="-5" height="10" width="${this.lineSpan}" stroke="none" fill="transparent" />
            <line x1="0" y1="0" x2="${this.lineSpan}" y2="0" />
          </g>`
        }, '')
        svg += players.reduce((result, next, idx) => { // path
          return `${result}
          <g id="adima-player${idx}-path-container">
            <path id="adima-player${idx}-path" fill="transparent"/>
          </g>`
        }, '')
        svg += `
          <g id="adima-indicator" style="display: none" >
            <circle r="4" fill="blue" stroke="none" />
          </g>`
      svg += `
        </g>`
      svg += `
        <g id="adima-goal-container" transform="translate(0, ${this.footerHeight})" >`  // TODO why don't we have to add this.vLineHeight?
        svg += goals.reduce((result, next, idx) => {
          return `${result}
          <g id="adima-goal${idx}" class="adima-goal" style="transform:translate(${vLines[idx].position.x-this.lineSpan/2}px,${this.vLineHeight}px)" >
            <svg width="${this.lineSpan}" height="${this.footerHeight}" >
              <svg width="100%" height="100%" >
                <foreignObject width="100%" height="100%" >
                  <div class='adima-goal-editable-element' style="display:none" contenteditable>${next.label}</div>
                </foreignObject>
                <text class="adima-goal-text" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" >${next.label}</text>
              </svg>
              <svg class="adima-goal-blind" style="display:none" width="100%" height="100%" >
                <rect width="100%" height="100%" fill="grey" ></rect>
                <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" >?</text>
              </svg>
            </svg>
          </g>`
        }, '')
      svg += `
        </g>`
    svg += `
      </g>
      Sorry, your browser does not support inline SVG.
    </svg>`
    const menu = `
    <div id="adima-menu" class="adima-menu-container" style="display: none">
      ${Object.keys(this.ctxMenuHandlers).reduce((result, next) => `${result}
      <div class="adima-menu-item" >
        <span class="adima-menu-item-text">${next}</span>
      </div>`, '')}
    </div>`

    this.targetElm.innerHTML = svg + menu;
    this.data = {
      vLines,
      hLines,
      innerHTML: this.targetElm.innerHTML,
      activeVlineIdx: this.NO_INDICATOR,
      players,
      goals,
    };
    logger.log(JSON.parse(JSON.stringify(this.data)));

    const adimaMainElm = document.getElementById('adima-main-container') as unknown as SVGElement // https://github.com/microsoft/TypeScript/issues/32822
    const menuElm = document.getElementById('adima-menu') as HTMLElement
    adimaMainElm.addEventListener('contextmenu', cEvt => {
      cEvt.preventDefault();
      menuElm.style.left = cEvt.pageX + 'px';
      menuElm.style.top = cEvt.pageY + 'px';
      menuElm.style.display = '';
      const clearCtxMenu = () => {
        menuElm.style.display = 'none';
        document.removeEventListener('mousedown', clearCtxMenu);
      };
      document.addEventListener('mousedown', clearCtxMenu);
    });
    Object.values(this.ctxMenuHandlers).forEach((func, idx) => {
      menuElm.children[idx].addEventListener('mousedown', evt => func(evt, this));
    });

    document.querySelectorAll('.adima-player-text').forEach((n) => {
      n.addEventListener('click', this.handlePlayerClick);
    });
    document.querySelectorAll('.adima-player-editable-element').forEach((n) => {
      n.addEventListener('blur', this.handlePlayerBlur);
    });
    document.querySelectorAll('.adima-goal-text').forEach((n) => {
      n.addEventListener('click', this.handleGoalClick);
    });
    document.querySelectorAll('.adima-goal-editable-element').forEach((n) => {
      n.addEventListener('blur', this.handleGoalBlur);
    });

    document.querySelectorAll('.adima-hline').forEach((n) => {
      this.draggablify(n as Element);
    });
  };
  public handlePlayerClick = (e: Event) => {
    this.toEditable(e, 'player');
  }
  public handleGoalClick = (e: Event) => {
    this.toEditable(e, 'goal');
  }
  private readonly toEditable = (e: Event, target: 'player' | 'goal') => {
    const textElm = e.currentTarget as SVGTextElement;
    textElm.style.display = 'none';
    const targetElm = textElm.closest(`.adima-${target}`) as SVGGElement;
    const divElm = targetElm.querySelector('div') as HTMLDivElement;
    divElm.style.display = '';
    divElm.focus();
  };
  public handlePlayerBlur = (e: Event) => {
    this.toLabel(e, 'player');
  }
  public handleGoalBlur = (e: Event) => {
    this.toLabel(e, 'goal');
  }
  private readonly toLabel = (e: Event, target: 'goal' | 'player') => {
    const divElm = e.currentTarget as HTMLDivElement;
    const targetElm = divElm.closest(`.adima-${target}`) as SVGGElement;
    const idx = targetElm.id.replace(`adima-${target}`,'');
    this.data.goals[idx].label = divElm.textContent || '';
    divElm.style.display = 'none';
    const textElm = targetElm.querySelector(`.adima-${target}-text`) as SVGTextElement;
    textElm.textContent = this.data.goals[idx].label;
    textElm.style.display = '';
  };
  public addVLine = () => {
    const prevLastVLineIdx = this.data.vLines.length-1;
    const prevLastVLine = this.data.vLines[prevLastVLineIdx];
    const newVLine = new VLine({ position: { x: prevLastVLine.position.x + this.lineSpan }, LINE_SPAN: this.lineSpan });
    this.data.vLines.push(newVLine);
    const prevLastPlayerIdx = this.data.players.length-1;
    this.data.players.push({ name: ''+(this.data.players.length+1), path: [] });
    const prevLastGoalIdx = this.data.goals.length-1;
    this.data.goals.push({ label: String.fromCharCode(this.CHAR_A+this.data.goals.length) });
    const lastVLineElm = document.getElementById('adima-vline'+prevLastVLineIdx) as unknown as SVGElement;
    const vLineClone = lastVLineElm.cloneNode(true) as SVGGElement;
    vLineClone.id = 'adima-vline' + (this.data.vLines.length-1);
    vLineClone.setAttribute('transform', `translate(${newVLine.position.x}, 0)`);
    (lastVLineElm.parentNode as Node).insertBefore(vLineClone, lastVLineElm.nextSibling);
    const lastPlayerElm = document.getElementById(`adima-player${prevLastPlayerIdx}`) as Element;
    const playerClone = lastPlayerElm.cloneNode(true) as SVGGElement;
    const playerTxtElm = playerClone.querySelector('text') as SVGTextElement;
    playerTxtElm.textContent = this.data.players[this.data.players.length-1].name;
    playerTxtElm.addEventListener('click', this.handlePlayerClick);
    const playerDivElm = playerClone.querySelector('div') as HTMLDivElement;
    playerDivElm.textContent = this.data.players[this.data.players.length-1].name;
    playerDivElm.addEventListener('blur', this.handlePlayerBlur);
    playerClone.id = `adima-player${this.data.players.length-1}`;
    playerClone.setAttribute('x', ''+(newVLine.position.x-this.lineSpan/2));
    playerClone.removeAttribute('stroke');
    (lastPlayerElm.parentNode as Node).insertBefore(playerClone, lastPlayerElm.nextSibling);
    const lastGoalElm = document.getElementById(`adima-goal${prevLastGoalIdx}`) as Element;
    const goalClone = lastGoalElm.cloneNode(true) as SVGGElement;
    const goalTxtElm = goalClone.querySelector('.adima-goal-text') as SVGTextElement;
    goalTxtElm.textContent = this.data.goals[this.data.goals.length-1].label;
    goalTxtElm.addEventListener('click', this.handleGoalClick);
    const divElm = goalClone.querySelector('.adima-goal-editable-element') as HTMLDivElement;
    divElm.textContent = this.data.goals[this.data.goals.length-1].label;
    divElm.addEventListener('blur', this.handleGoalBlur);
    goalClone.id = `adima-goal${this.data.goals.length-1}`;
    goalClone.setAttribute('style', `transform:translate(${newVLine.position.x-this.lineSpan/2}px,${this.vLineHeight}px)`);
    goalClone.removeAttribute('stroke');
    (lastGoalElm.parentNode as Node).insertBefore(goalClone, lastGoalElm.nextSibling);
    const lastPathContainerElm = document.getElementById(`adima-player${prevLastPlayerIdx}-path-container`) as Element;
    const pathClone = lastPathContainerElm.cloneNode(true) as SVGGElement;
    pathClone.id = `adima-player${this.data.players.length-1}-path-container`;
    pathClone.children[0].id = `adima-player${this.data.players.length-1}-path`;
    (lastPathContainerElm.parentNode as Node).insertBefore(pathClone, lastPathContainerElm.nextSibling);
    const adimaRectElm = document.getElementById('adima-bg-rect') as Element;
    adimaRectElm.setAttribute('width', '' + (this.lineSpan*this.data.vLines.length));
    const svgElm = document.getElementById('adima-svg') as unknown as SVGElement; // https://github.com/microsoft/TypeScript/issues/32822
    svgElm.setAttribute('width', '' + (this.lineSpan*this.data.vLines.length));
  };
  public removeVLine() {
    if (this.data.vLines.length === 0) return;
    const lastVLine = this.data.vLines[this.data.vLines.length-1]
    Object.keys(lastVLine.routes).forEach((hLineKey) => {
      this.removeRoute(this.data.hLines[hLineKey]);
      const hLineElm = document.getElementById(hLineKey);
      hLineElm!.parentNode!.removeChild(hLineElm!);
    });
    this.data.vLines.pop();
    const lastVLineElm = document.getElementById('adima-vline'+this.data.vLines.length);
    lastVLineElm!.parentNode!.removeChild(lastVLineElm!);
    this.data.players.pop();
    const lastPlayerElm = document.getElementById(`adima-player${this.data.players.length}`) as Element;
    lastPlayerElm!.parentNode!.removeChild(lastPlayerElm!);
    const lastPathContainerElm = document.getElementById(`adima-player${this.data.players.length}-path-container`) as Element;
    lastPathContainerElm!.parentNode!.removeChild(lastPathContainerElm!);
    this.data.goals.pop();
    const lastGoalElm = document.getElementById(`adima-goal${this.data.goals.length}`) as Element;
    lastGoalElm!.parentNode!.removeChild(lastGoalElm!);
    const adimaRectElm = document.getElementById('adima-bg-rect') as Element;
    adimaRectElm.setAttribute('width', '' + (this.lineSpan*this.data.vLines.length));
    const svgElm = document.getElementById('adima-svg') as unknown as SVGElement; // https://github.com/microsoft/TypeScript/issues/32822
    svgElm.setAttribute('width', '' + (this.lineSpan*this.data.vLines.length));
  }
  public addVLines(num: number) {
    if (0<num) {
      for (let i=0; i<num; i++) this.addVLine();
    } else if(num<0) {
      for (let i=num; i<0 || 2 < this.numVLines; i++) this.removeVLine();
    }
  }
  public addHLine = ({x,y}: Pozition) => {
    const ownerIdx = (() => {
      const i = (this.data.vLines.findIndex(v => {
        return x < v.position.x;
      }))
      const isLeftEnd = i === 0;
      const isRightEnd = i === -1;
      return isLeftEnd ? 0 : (isRightEnd ? this.data.vLines.length - 2 : i - 1);
    })();
    const key = `hline${Date.now()}1`;
    const newHLine: HLine = {
      key,
      position: new HLinePos({ x: this.data.vLines[ownerIdx].position.x, y, MIN_Y: this.vLineContentTop, MAX_Y: this.vLineContentBottom }),
      ownerIdx,
    };
    newHLine.position.y = newHLine.position.adjustedY; // New horizontal line should be placed at valid position, so let's immediately overwrite it
    this.data.hLines[key] = newHLine;
    this.addRoute(this.data.vLines, newHLine, this.data.hLines);
    logger.log(JSON.parse(JSON.stringify(this.data)));
    const hLineElm = document.querySelector('.adima-hline') as Node;
    const clone = hLineElm.cloneNode(true) as Element;
    clone.id = key;
    clone.setAttribute('transform', `translate(${newHLine.position.x}, ${newHLine.position.y})`);
    (hLineElm.parentNode as Node).insertBefore(clone, hLineElm.nextSibling);
    this.draggablify(clone);
  };
  public removeHLine = () => {
    const hLineElms = document.querySelectorAll('.amida-hline');
    const lastHLineElm = hLineElms[hLineElms.length-1];
    const hLine = this.data.hLines[lastHLineElm.id];
    this.removeRoute(hLine);
    delete this.data.hLines[lastHLineElm.id];
    (lastHLineElm.parentNode as Node).removeChild(lastHLineElm);
  }
  public addHLinesRandomly(num: number) {
    if (0<num) {
      for (let i=0; i<num; i++) {
        const x = Math.floor(Math.random() * this.numVLines);
        const y = Math.floor(Math.random() * this.vLineContentHeight) + (this.vLineContentTop);
        this.addHLine({x,y});
      }
    } else if(num<0) {
      for (let i=num; i<0 || 0 < this.numHLines; i++) {
        this.removeHLine();
      }
    }
  }
  public startAdima = async () => {
    this.data.players = this.calcPath(this.data);
    await (async () => {
      for (let i=0; i<this.data.players.length; i++) {
        const playerElm = document.getElementById(`adima-player${i}`) as unknown as SVGElement;
        playerElm.setAttribute('stroke', this.colors[i%this.colors.length]);
        await this.renderPathOneByOne(this.data.players[i].path, i);
        const goalElm = document.getElementById(`adima-goal${(this.data.players[i].goalIdx as number)}`) as unknown as SVGGElement;
        const goalBlindElm = goalElm.querySelector('.adima-goal-blind') as SVGTextElement;
        await this.revealGoal(goalBlindElm); // async to make it available to be used with animation
        goalElm.setAttribute('stroke', this.colors[i%this.colors.length]);
      }
    })();
    logger.log(this.data);
  };
  public clearPath = () => {
    this.data.players = this.data.players.map(p => ({
      ...p,
      path: [],
    }));
    this.data.players.forEach((p,i) => {
      const pathElm = document.getElementById(`adima-player${i}-path`) as Element;
      pathElm.removeAttribute('stroke');
      pathElm.removeAttribute('stroke-width');
      pathElm.removeAttribute('d');
      const playerElm = document.getElementById(`adima-player${i}`) as Element;
      playerElm.removeAttribute('stroke');
      const goalElm = document.getElementById(`adima-goal${i}`) as Element;
      goalElm.removeAttribute('stroke');
    });
  };
  public shuffleGoals = () => {
    return new Promise(resolve => {
      const PARSE_TRANSLATE = /translate\(\s*(-?\d+\.?\d*\D*)\s*,\s*(-?\d+\.?\d*\D*)\s*\)/;
      const SHUFFLE_DURATION = 1000;
      const SHUFFLE_DURATION_MIN = 100;
      const TIMES_OF_SHUFFLE = 25;
      const goalElms = document.querySelectorAll('.adima-goal') as NodeListOf<SVGElement>;
      const originalTransforms = (() => {
        const arr : string[] = [];
        goalElms.forEach((e,i) => {
          arr[i] = e.style.transform;
        });
        return arr;
      })();
      goalElms.forEach((e) => {
        e.style.transitionDuration = SHUFFLE_DURATION+'ms';
      });
      let i=0;
      let duration = SHUFFLE_DURATION;
      let justBefore = Date.now();
      fn();
      function fn() {
        const pickedIndex1 = Math.floor(Math.random() * goalElms.length);
        const pickedIndex2 = (() => {
          const pickedIndex = Math.floor(Math.random() * (goalElms.length-1));
          return pickedIndex < pickedIndex1 ? pickedIndex : pickedIndex + 1;
        })();
        const goalElm1 = goalElms[pickedIndex1];
        const goalElm2 = goalElms[pickedIndex2];
        const [,x1,y1] = goalElm1.style.transform.match(PARSE_TRANSLATE) as string[];
        const [,x2,y2] = goalElm2.style.transform.match(PARSE_TRANSLATE) as string[];
        goalElm1.style.transform = 'translate('+x2+','+y2+')';
        goalElm2.style.transform = 'translate('+x1+','+y1+')';
        setTimeout(() => {
          if (TIMES_OF_SHUFFLE<i++) {
            actualShuffle();
            resolve();
            return;
          }
          duration -= (10 - i/2)*10; // An = An-1 - 10 * (10 - (n-10)/2)  (A1 = 1000)
          const now = Date.now();
          logger.log(i, now - justBefore, duration);
          justBefore = now;
          goalElms.forEach((e) => {
            e.style.transitionDuration = duration+'ms';
          });
          fn();
        }, duration < SHUFFLE_DURATION_MIN ? SHUFFLE_DURATION_MIN : duration);
      }
      function actualShuffle() {
        goalElms.forEach((e, i) => { // reset translate values
          e.style.transform = originalTransforms[i];
        });
        const textElms = document.querySelectorAll('.adima-goal-text') as NodeListOf<SVGTextElement>;
        const divElms = document.querySelectorAll('.adima-goal-editable-element') as NodeListOf<HTMLDivElement>;
        textElms.forEach((textElm, idx) => { // shuffle texts
          const pickedIdx = Math.floor(Math.random()*(textElms.length - idx));
          const tmp = textElms[pickedIdx].textContent;
          textElms[pickedIdx].textContent = textElms[idx].textContent;
          textElms[idx].textContent = tmp;
          divElms[pickedIdx].textContent = divElms[idx].textContent;
          divElms[idx].textContent = tmp;
        });
      }
    });
  }
  public hideGoals = () => {
    const goalBlindElms = document.querySelectorAll('.adima-goal-blind') as NodeListOf<SVGElement>;
    goalBlindElms.forEach((e) => {
      e.style.display = '';
    });
  }
  public revealGoals = () => {
    const goalBlindElms = document.querySelectorAll('.adima-goal-blind') as NodeListOf<SVGElement>;
    goalBlindElms.forEach((e) => {
      this.revealGoal(e);
    });
  }
  public revealGoal = (goalBlindElm: SVGElement) => {
    goalBlindElm.style.display = 'none';
  }
  public calcPath = ({ players, vLines, hLines } : AdimaData) => {
    return players.map((p, idx) => {
      p.path.push({ x: vLines[idx].position.x, y: 0 });
      const self = this;
      const finIdx = (function setMidwayPathAndGetFinIdx(routeKey: string | null, i: number): number {
        if (!routeKey) return i;
        const hl = hLines[routeKey];
        const vl = vLines[i];
        p.path.push({ x: vl.position.x, y: hl.position.y });
        const route = vl.routes[routeKey];
        const nextVl = vLines[i+route.lr];
        p.path.push({ x: nextVl.position.x, y: hl.position.y });
        return setMidwayPathAndGetFinIdx(nextVl.routes[routeKey].nextKey, i+route.lr);
      })(vLines[idx].startRoute, idx);
      p.path.push({ x: vLines[finIdx].position.x, y: self.vLineHeight });
      p.goalIdx = finIdx;
      return p;
    });
  }
  public renderPathOneByOne = (path: Path, idx: number) => {
    return new Promise(resolve => {
      let command = `M ${path[0].x} ${path[0].y}`;
      let cnt = 1;
      const pathElm = document.getElementById(`adima-player${idx}-path`) as Element;
      pathElm.setAttribute('stroke', this.colors[idx%this.colors.length]);
      pathElm.setAttribute('stroke-width', '3');
      const intervalId = global.setInterval(() => {
        if (cnt >= path.length) {
          global.clearInterval(intervalId);
          resolve();
          return;
        }
        command = `${command} L ${path[cnt].x} ${path[cnt].y}`;
        cnt++
        pathElm.setAttribute('d', command);
      }, 100);
    });
  }
  private readonly draggablify = (hLineElm: Element) => {
    hLineElm.addEventListener('mousedown', dragStart);
    hLineElm.addEventListener('touchstart', dragStart, {passive: true});
    const self = this;
    function dragStart(strtEvt: MouseEvent | TouchEvent) {
      if (strtEvt instanceof MouseEvent && strtEvt.button !== 0) return;
      const initialPointX = (strtEvt instanceof MouseEvent ? strtEvt.clientX : strtEvt.touches[0].clientX);
      const initialPointY = (strtEvt instanceof MouseEvent ? strtEvt.clientY : strtEvt.touches[0].clientY);
      const key = (strtEvt.currentTarget as Element).id;
      const hLine = self.data.hLines[key];
      const initialPosition = hLine.position;
      self.data.activeVlineIdx = hLine.ownerIdx
      self.removeRoute(hLine);
      logger.log(JSON.parse(JSON.stringify(self.data)));
      let vLine = self.data.vLines[hLine.ownerIdx];
      const indicator = document.getElementById('adima-indicator') as unknown as SVGElement;
      indicator.setAttribute('class', 'active');
      indicator.setAttribute('transform', `translate(${vLine.position.x},${hLine.position.y})`);
      document.addEventListener('mousemove', dragging);
      document.addEventListener('touchmove', dragging, {passive: false});
      function dragging(mvEvt: MouseEvent | TouchEvent) {
        mvEvt.preventDefault();
        const diffX = (mvEvt instanceof MouseEvent ? mvEvt.clientX : mvEvt.touches[0].clientX) - initialPointX;
        const diffY = (mvEvt instanceof MouseEvent ? mvEvt.clientY : mvEvt.touches[0].clientY) - initialPointY;
        hLine.position = new HLinePos({
          x: initialPosition.x + diffX,
          y: initialPosition.y + diffY,
          MIN_Y: self.vLineContentTop,
          MAX_Y: self.vLineContentBottom,
        })
        if (hLine.position.x < vLine.boundary.x1) {
          if (0 < hLine.ownerIdx) {
            hLine.ownerIdx--
            vLine = self.data.vLines[hLine.ownerIdx]
            self.data.activeVlineIdx = hLine.ownerIdx
          } else {
            self.data.activeVlineIdx = self.NO_INDICATOR
          }
        } else if (vLine.boundary.x2 < hLine.position.x) {
          if (hLine.ownerIdx < self.data.vLines.length - 2) {
            hLine.ownerIdx++
            vLine = self.data.vLines[hLine.ownerIdx]
            self.data.activeVlineIdx = hLine.ownerIdx
          } else {
            self.data.activeVlineIdx = self.NO_INDICATOR
          }
        } else {
          self.data.activeVlineIdx = hLine.ownerIdx
        }
        hLineElm.setAttribute('transform', `translate(${hLine.position.x},${hLine.position.y})`)
        if (self.data.activeVlineIdx === self.NO_INDICATOR) {
          indicator.style.display = 'none';
        } else {
          indicator.style.display = '';
          indicator.setAttribute('transform', `translate(${vLine.position.x},${hLine.position.adjustedY})`)
        }
      }
      document.addEventListener('mouseup', dragEnd)
      document.addEventListener('touchend', dragEnd)
      function dragEnd() {
        document.removeEventListener('mousemove', dragging)
        document.removeEventListener('touchmove', dragging)
        document.removeEventListener('mouseup', dragEnd)
        document.removeEventListener('touchend', dragEnd)
        if (self.data.activeVlineIdx === self.NO_INDICATOR) {
          delete self.data.hLines[key];
          (hLineElm.parentNode as Node).removeChild(hLineElm);
        } else {
          hLine.position.x = vLine.position.x;
          hLine.position.y = hLine.position.adjustedY;
          self.addRoute(self.data.vLines, hLine, self.data.hLines); // old route is already removed on mousedown, so just add it
          hLineElm.setAttribute('transform', `translate(${hLine.position.x},${hLine.position.y})`)
          indicator.style.display = 'none';
        }
        logger.log(JSON.parse(JSON.stringify(self.data)));
      }
    }
  }
  private readonly addRoute = (vls: VLine[], newHLine: HLine, hLines: HLines) => {
    recursive(vls[newHLine.ownerIdx].startRoute, vls[newHLine.ownerIdx], 1, newHLine, hLines);
    recursive(vls[newHLine.ownerIdx+1].startRoute, vls[newHLine.ownerIdx+1], -1, newHLine, hLines);
    function recursive(currentKey: string | null, vl: VLine, lr: VLineRouteLR, newHLine: HLine, hLines: HLines) {
      if (!currentKey) { // initialize
        /**
         * Before:
         *  [Start] -> [End]
         * After:
         *  [Start] -> |newKey| -> [End]
         */
        vl.startRoute = newHLine.key;
        vl.routes[newHLine.key] = { nextKey: null, prevKey: null, lr }
        return;
      }
      const currentRoute = vl.routes[currentKey];
      // @ts-ignore vl.startRoute shouldn't be undefined, because initialize block would be executed beforehand
      const startHLine = hLines[vl.startRoute]
      if (newHLine.position.y < startHLine.position.y) { // addToFirst
        /**
         * Before:
         *  [Start] -> |currentKey|
         * After:
         *  [Start] -> |newKey| -> |currentKey|
         */
        logger.log('first.vl', JSON.parse(JSON.stringify(vl)));
        logger.log('first.newHLine.key', newHLine.key);
        logger.log('first.prevKey', null);
        vl.startRoute = newHLine.key;
        vl.routes[currentKey].prevKey = newHLine.key;
        vl.routes[newHLine.key] = { nextKey: currentKey, prevKey: null, lr };
        return;
      } else if (!currentRoute.nextKey) { // addToLast
        /**
         * Before:
         *  |currentKey| -> [End]
         * After:
         *  |currentKey| -> |newKey| -> [End]
         */
        logger.log('last.vl', JSON.parse(JSON.stringify(vl)));
        logger.log('last.newHLine.key', newHLine.key);
        logger.log('last.currentKey', currentKey);
        vl.routes[newHLine.key] = { nextKey: null, prevKey: currentKey, lr };
        currentRoute.nextKey = newHLine.key;
        return;
      } else if ( newHLine.position.y <= hLines[currentRoute.nextKey].position.y) { // addToMiddle
        /**
         * Before:
         *  |currentKey| -> |nextKey|
         * After:
         *  |currentKey| -> |newKey| -> |nextKey|
         */
        logger.log('middle.vl', JSON.parse(JSON.stringify(vl)));
        logger.log('middle.newHLine.key', newHLine.key);
        logger.log('middle.currentKey', currentKey);
        vl.routes[currentRoute.nextKey].prevKey = newHLine.key;
        vl.routes[newHLine.key] = { nextKey: currentRoute.nextKey, prevKey: currentKey, lr };
        currentRoute.nextKey = newHLine.key;
        return;
      }
      recursive(currentRoute.nextKey, vl, lr, newHLine, hLines);
    }
  }
  private readonly removeRoute = (hl: HLine) => {
    const vls = this.data.vLines;
    fn(hl.ownerIdx);
    fn(hl.ownerIdx+1);
    function fn(idx) {
      const routes = vls[idx].routes;
      const route = routes[hl.key];
      if (route.prevKey) routes[route.prevKey].nextKey = route.nextKey;
      else vls[idx].startRoute = route.nextKey;
      if (route.nextKey) routes[route.nextKey].prevKey = route.prevKey;
      delete routes[hl.key];
    }
  }
}

export default Adima;

