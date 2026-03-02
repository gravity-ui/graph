### Collapse Group

Нужно научить группы блоков схлапываться и расхлапываться. 
При схлапывании, блоки не должны удаляться, а должны лишь скрываться
Скрытый Block не должен рисоваться на любом уровне(minimistic/schematic/detailed)
Порты скрытых портов должны делегироваться группе
После схлапывания, все блоки должны хлопнуть пространство по формуле

``` 
// Всевдокод
cosnt initial = GroupGeometry(x, y, width, height);

const target = GroupGeometry(x,y,width,height);

const diffX = (initial.x + initial.width) - (target.x + target.width);
const diffY = (initial.y + initial.height) - (target.y + target.height);

function apply(block, diffX, diffY) {
 block.setGeometry({x: x - diffX, y: y - diffY});
}
```

При расхлопывании группы, пространство должно, наоборот расхлопнуться. 

Группа должна схлопываться в верхний левых угол(т.е изменять только width/height)

View для схлопнутой и расхлопнутой view будет различаться.

Реализация должны быть в виде кастомного компонента Group который является расширением обычной компоненты группы @src/components/canvas/group/Group.ts