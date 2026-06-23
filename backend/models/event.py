class Event(Base):

    __tablename__="events"

    id = Column(Integer,primary_key=True)

    title = Column(String)

    event_date = Column(String)

    venue = Column(String)