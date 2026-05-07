from django.urls import path
from . import views

urlpatterns = [
    path('node/<str:node_id>', views.get_node, name='get_node'),
    path('node', views.add_node, name='add_node'),
    path('edge', views.add_edge, name='add_edge'),
]