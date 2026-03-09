Нужно научить порты становиться зеркалами других портов
const port = getPort(someId);
const portDelegate = getPort('customPort');

port.delegate(portDelegate);

portDelegate.setPoint(x,y);

port.getPoint() // x,y; port.getPoint() => port.delegate.getPoint();
