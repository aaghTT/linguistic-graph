# Лингвистический граф

Визуализация семантических связей между словами в виде интерактивного графа.

## Возможности

- Интерактивная визуализация семантических связей
- Поиск и раскрытие узлов графа
- Drag and drop для перемещения узлов
- Авто-центрирование на выбранном узле
- Тёмная тема
- Экспорт графа в JSON
- Автоматическое управление памятью (макс. 20 видимых узлов)

## Технологии

- **Frontend**: D3.js, HTML5, CSS3
- **Backend**: Django, Memgraph

## Установка и запуск

Клонируйте репозиторий:
```bash
git clone https://github.com/aaghTT/linguistic-graph.git
cd linguistic-graph/frontend
```

### Frontend

Откройте index.html в браузере или используйте live-server:
```bash
npx live-server
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python manage.py runserver
```
